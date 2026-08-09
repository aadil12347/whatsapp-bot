const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { killPreviousInstances } = require('./src/Utils/singleInstance');
killPreviousInstances();

const { downloadSessionFromSupabase } = require('./src/Utils/supabaseSession');

function cleanCorruptedSessionFiles(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let removedCount = 0;
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isFile()) {
                if (fs.statSync(fullPath).size === 0) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                } else if (file.endsWith('.json')) {
                    try {
                        JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    } catch (_) {
                        fs.unlinkSync(fullPath);
                        removedCount++;
                    }
                }
            }
        }
        if (removedCount > 0) {
            console.log(`🧹 Cleaned ${removedCount} corrupted/0-byte session files from ${path.basename(dir)}/`);
        }
    } catch (_) {}
}

/**
 * Fresh start — delete ALL session files except creds.json on every startup.
 * creds.json = your WhatsApp login identity (keeps you logged in).
 * Everything else (pre-key, sender-key, session files) gets recreated 
 * automatically as needed. This prevents the Baileys Signal protocol
 * from entering an infinite session-sync loop on reconnect.
 */
function freshStartSession(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let removedCount = 0;
        for (const file of files) {
            // Keep ONLY creds.json — everything else is temporary
            if (file === 'creds.json') continue;
            
            const fullPath = path.join(dir, file);
            try {
                if (fs.statSync(fullPath).isFile()) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                }
            } catch (_) {}
        }
        if (removedCount > 0) {
            console.log(`🧹 Fresh start: removed ${removedCount} temporary session files from ${path.basename(dir)}/ (kept creds.json)`);
        }
    } catch (err) {
        console.warn('⚠️ Session cleanup error:', err.message);
    }
}

async function startBot() {
    console.log('🚀 Starting your custom DanieWatch Downloader Bot...');

    const sessionDir = path.join(__dirname, 'session');
    const sessDir = path.join(__dirname, 'sess');

    cleanCorruptedSessionFiles(sessionDir);
    cleanCorruptedSessionFiles(sessDir);
    freshStartSession(sessionDir);
    freshStartSession(sessDir);

    // Auto-download latest session from Supabase if available
    try {
        await downloadSessionFromSupabase(sessDir);
        cleanCorruptedSessionFiles(sessDir);

        if (fs.existsSync(sessDir)) {
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            const files = fs.readdirSync(sessDir);
            for (const file of files) {
                const srcFile = path.join(sessDir, file);
                const destFile = path.join(sessionDir, file);
                if (fs.statSync(srcFile).isFile() && fs.statSync(srcFile).size > 0) {
                    fs.copyFileSync(srcFile, destFile);
                }
            }
        }
    } catch (e) {
        console.warn('⚠️ Note: Supabase session sync skipped or failed:', e.message || e);
    }

    // IMPORTANT: Clean stale session files AFTER Supabase restore.
    // Supabase restores ALL files including old pre-key/sender-key/session files
    // that cause "Closing session" spam and reconnection loops.
    // Only creds.json is needed — everything else gets recreated automatically.
    freshStartSession(sessionDir);

    // Auto-update: Pull fresh files from GitHub at startup
    try {
        console.log('🔄 Checking for fresh bot files from GitHub...');
        let pullOutput;
        try {
            pullOutput = execSync('git pull', { stdio: 'pipe', encoding: 'utf-8', timeout: 20000 });
        } catch (e) {
            pullOutput = execSync('git pull origin main', { stdio: 'pipe', encoding: 'utf-8', timeout: 20000 });
        }
        
        if (pullOutput.includes('Already up to date.') || pullOutput.includes('Already up-to-date.')) {
            console.log('✅ Your bot is already up-to-date with the repository.');
        } else {
            console.log('🎉 Successfully fetched fresh files from GitHub!');
            console.log(pullOutput);
            
            if (pullOutput.includes('package.json') || pullOutput.includes('pnpm-lock.yaml')) {
                console.log('⚠️ Dependencies might have changed. It is recommended to run "npm install" or "pnpm install" to ensure all packages are updated.');
            }
        }
    } catch (error) {
        console.warn('⚠️ Warning: Failed to fetch updates from GitHub (perhaps offline, no git repo initialized, or local conflicts exist):');
        console.warn(error.message);
    }

    const botBrainPath = path.join(__dirname, 'queen.js');

    if (!fs.existsSync(botBrainPath)) {
        console.error('❌ Error: queen.js is missing! Please make sure the brain file is in the folder.');
        process.exit(1);
    }

    // Create a preload script that suppresses Baileys' noisy "Closing session" dumps
    const preloadPath = path.join(__dirname, '_suppress_session_logs.js');
    fs.writeFileSync(preloadPath, `
// Auto-generated: Suppress Baileys "Closing session" spam on reconnect
const _origLog = console.log;
const _origWarn = console.warn;
function _isSuppressed(args) {
    for (const a of args) {
        const str = typeof a === 'string' ? a : (a && typeof a === 'object' ? JSON.stringify(a).slice(0, 200) : String(a));
        if (str.includes('Closing session') || str.includes('SessionEntry') || str.includes('_chains') || str.includes('currentRatchet') || str.includes('ephemeralKeyPair') || str.includes('indexInfo') || str.includes('pendingPreKey')) return true;
    }
    return false;
}
console.log = function(...args) {
    if (!_isSuppressed(args)) _origLog.apply(console, args);
};
console.warn = function(...args) {
    if (!_isSuppressed(args)) _origWarn.apply(console, args);
};
`, 'utf-8');

    // Start the bot process with the log suppression preload
    const child = fork(botBrainPath, [], {
        stdio: 'inherit',
        windowsHide: true,
        execArgv: ['--require', preloadPath]
    });

    const maxRunMinutes = parseInt(process.env.MAX_RUN_TIME_MINUTES || '0', 10);
    if (maxRunMinutes > 0) {
        console.log(`⏱️ Auto-restart timer active: Bot will exit gracefully in ${maxRunMinutes} minutes to save session & end run.`);
        setTimeout(() => {
            console.log(`⏰ ${maxRunMinutes} minutes elapsed. Stopping bot process for clean exit...`);
            child.kill('SIGTERM');
            setTimeout(() => {
                if (!child.killed) child.kill('SIGKILL');
                process.exit(0);
            }, 5000);
        }, maxRunMinutes * 60 * 1000);
    }

    child.on('error', (err) => {
        console.error('❌ Bot crashed with error:', err.message);
    });

    child.on('exit', (code) => {
        console.log(`🤖 Bot process exited with code ${code}`);
        process.exit(code || 0);
    });
}

startBot();