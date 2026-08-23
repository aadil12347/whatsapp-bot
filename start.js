const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { killPreviousInstances } = require('./src/Utils/singleInstance');
killPreviousInstances();

const { uploadSessionToSupabase, downloadSessionFromSupabase, acquireBotLock, releaseBotLock, heartbeatBotLock } = require('./src/Utils/supabaseSession');

/**
 * Auto-patch libsignal's session_record.js to silence verbose session logging.
 * The library logs entire SessionEntry objects (with all crypto Buffer keys)
 * on every session open/close/cleanup, producing 17,000+ lines that block
 * the Node.js event loop and make the bot unresponsive.
 * This patch runs on every startup so it survives npm reinstalls.
 */
function patchLibsignal() {
    try {
        // Find session_record.js in node_modules
        const candidates = [
            path.join(__dirname, 'node_modules', '.pnpm', 'libsignal@6.0.0', 'node_modules', 'libsignal', 'src', 'session_record.js'),
        ];
        // Also try to find dynamically
        try {
            const libsignalMain = require.resolve('libsignal');
            const libsignalDir = path.dirname(libsignalMain);
            candidates.push(path.join(libsignalDir, 'src', 'session_record.js'));
        } catch (_) {}

        let patched = 0;
        for (const filePath of candidates) {
            if (!fs.existsSync(filePath)) continue;
            let content = fs.readFileSync(filePath, 'utf-8');
            if (!content.includes('console.info("Closing session:"') && 
                !content.includes('console.warn("Session already closed"') &&
                !content.includes('console.info("Removing old closed session:"')) {
                continue; // Already patched
            }
            content = content
                .replace(/console\.warn\("Session already closed",\s*session\);/g, '// [patched] silent')
                .replace(/console\.info\("Closing session:",\s*session\);/g, '// [patched] silent')
                .replace(/console\.warn\("Session already open"\);/g, '// [patched] silent')
                .replace(/console\.info\("Opening session:",\s*session\);/g, '// [patched] silent')
                .replace(/console\.info\("Removing old closed session:",\s*oldestSession\);/g, '// [patched] silent');
            fs.writeFileSync(filePath, content, 'utf-8');
            patched++;
        }
        if (patched > 0) {
            console.log(`🔧 Auto-patched libsignal session logging (${patched} file(s)) — prevents session dump spam`);
        }
    } catch (err) {
        console.warn('⚠️ Could not auto-patch libsignal (non-critical):', err.message);
    }
}
patchLibsignal();

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

function syncDirectories(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    try {
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const srcFile = path.join(srcDir, file);
            const destFile = path.join(destDir, file);
            try {
                if (fs.statSync(srcFile).isFile() && fs.statSync(srcFile).size > 0) {
                    if (!fs.existsSync(destFile) || fs.statSync(destFile).mtimeMs < fs.statSync(srcFile).mtimeMs) {
                        fs.copyFileSync(srcFile, destFile);
                    }
                }
            } catch (_) {}
        }
    } catch (_) {}
}

function isEssentialSessionFile(file) {
    if (!file || typeof file !== 'string' || !file.endsWith('.json')) return false;
    return file === 'creds.json' ||
           file === 'active_chats.json' ||
           file === 'download_settings.json' ||
           file.startsWith('session-') ||
           file.startsWith('sender-key-') ||
           file.startsWith('pre-key-') ||
           file.startsWith('identity-key-') ||
           file.startsWith('lid-mapping-') ||
           file.startsWith('device-list-') ||
           file.startsWith('app-state-sync-');
}

function pruneSessionDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let removedCount = 0;
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        // Prune excess pre-keys beyond 15 newest
        const preKeys = files.filter(f => f.startsWith('pre-key-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(dir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch (_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        if (preKeys.length > 15) {
            for (const item of preKeys.slice(15)) {
                try { fs.unlinkSync(item.path); removedCount++; } catch (_) {}
            }
        }

        // Prune excess app-state beyond 10 newest
        const appStates = files.filter(f => f.startsWith('app-state-sync-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(dir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch (_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        if (appStates.length > 10) {
            for (const item of appStates.slice(10)) {
                try { fs.unlinkSync(item.path); removedCount++; } catch (_) {}
            }
        }

        const remainingFiles = fs.readdirSync(dir);
        for (const file of remainingFiles) {
            if (!file.endsWith('.json')) continue;
            const fullPath = path.join(dir, file);
            try {
                if (file === 'creds.json' || file === 'download_settings.json' || file === 'active_chats.json') {
                    continue;
                }
                if (!isEssentialSessionFile(file)) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                    continue;
                }
                const stat = fs.statSync(fullPath);
                if (now - stat.mtimeMs > thirtyDays) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                }
            } catch (_) {}
        }
        if (removedCount > 0) {
            console.log(`🧹 Pruned ${removedCount} non-essential/excess session files from ${path.basename(dir)}/`);
        }
    } catch (err) {
        console.warn('⚠️ Error during session pruning:', err.message);
    }
}

/**
 * Nuclear cleanup: Purge ONLY stale Signal ratchet state on startup.
 * Only deletes: session-*, sender-key-*, identity-key-*
 * These are the files that become stale between bot restarts and cause
 * "Failed to decrypt message with any known session" loops.
 * 
 * We KEEP everything else, including:
 *   - creds.json (master auth identity)
 *   - app-state-sync-key-*, app-state-sync-version-* (app state)
 *   - pre-key-* (pre-key material for new sessions)
 *   - lid-mapping-* (LID ↔ phone number maps — needed for fromMe detection)
 *   - device-list-* (device registry)
 *   - download_settings.json, active_chats.json (bot settings)
 *
 * Baileys will re-negotiate fresh E2EE sessions on demand.
 */
function purgeStaleRatchetState(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let purgedCount = 0;
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            // ONLY delete actual Signal ratchet files that go stale between restarts
            const isRatchetFile = file.startsWith('session-') || 
                                  file.startsWith('sender-key-') || 
                                  file.startsWith('identity-key-');
            
            if (!isRatchetFile) continue;
            
            const fullPath = path.join(dir, file);
            try {
                fs.unlinkSync(fullPath);
                purgedCount++;
            } catch (_) {}
        }
        
        if (purgedCount > 0) {
            console.log(`🔥 Purged ${purgedCount} stale Signal ratchet file(s) from ${path.basename(dir)}/ — fresh E2EE sessions will be negotiated on demand.`);
        }
    } catch (err) {
        console.warn('⚠️ Error during ratchet state purge:', err.message);
    }
}

async function startBot() {
    console.log('🚀 Starting your custom DanieWatch Downloader Bot...');

    const sessionDir = path.join(__dirname, 'session');
    const sessDir = path.join(__dirname, 'sess');

    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });

    cleanCorruptedSessionFiles(sessionDir);
    cleanCorruptedSessionFiles(sessDir);
    pruneSessionDirectory(sessionDir);
    pruneSessionDirectory(sessDir);

    // Session files are preserved across restarts so active E2EE ratchets remain valid.
    // Clean only corrupted (0-byte / invalid JSON) files if any exist.
    // purgeStaleRatchetState is disabled to prevent losing active session keys.

    // Auto-download latest session files from Supabase if available
    try {
        await downloadSessionFromSupabase(sessionDir);
        cleanCorruptedSessionFiles(sessionDir);

        // Backup valid session files from session/ to sess/ (NEVER overwrite session/ with stale sess/ files)
        syncDirectories(sessionDir, sessDir);
    } catch (e) {
        console.warn('⚠️ Note: Supabase session sync skipped or failed:', e.message || e);
    }

    // ── Acquire Supabase bot lock (wait for old instance to release) ──
    const MAX_LOCK_RETRIES = 10;
    const LOCK_RETRY_DELAY = 30000; // 30 seconds
    for (let attempt = 1; attempt <= MAX_LOCK_RETRIES; attempt++) {
        try {
            await acquireBotLock();
            break; // Lock acquired
        } catch (lockErr) {
            if (attempt < MAX_LOCK_RETRIES) {
                console.warn(`[BotLock] Attempt ${attempt}/${MAX_LOCK_RETRIES}: ${lockErr.message}`);
                await new Promise(r => setTimeout(r, LOCK_RETRY_DELAY));
            } else {
                console.warn(`[BotLock] Failed to acquire lock after ${MAX_LOCK_RETRIES} attempts. Starting anyway...`);
            }
        }
    }

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

    const botBrainPath = path.join(__dirname, 'queen_lite.js');

    if (!fs.existsSync(botBrainPath)) {
        console.error('❌ Error: queen_lite.js is missing! Please make sure the brain file is in the folder.');
        process.exit(1);
    }

    // queen_lite.js doesn't produce session dump spam, so no preload suppression needed.
    // Start the bot process directly
    const child = fork(botBrainPath, [], {
        stdio: 'inherit',
        windowsHide: true
    });

    // Periodic session sync to Supabase every 15 minutes
    const syncInterval = setInterval(async () => {
        try {
            console.log('☁️ Auto-syncing session state to Supabase...');
            await uploadSessionToSupabase(sessionDir);
        } catch (_) {}
    }, 15 * 60 * 1000);

    // Bot lock heartbeat every 60 seconds — tells other instances we're alive
    const lockHeartbeatInterval = setInterval(async () => {
        try {
            await heartbeatBotLock();
        } catch (_) {}
    }, 60 * 1000);

    const maxRunMinutes = parseInt(process.env.MAX_RUN_TIME_MINUTES || '0', 10);
    if (maxRunMinutes > 0) {
        console.log(`⏱️ Auto-restart timer active: Bot will exit gracefully in ${maxRunMinutes} minutes to save session & end run.`);
        setTimeout(async () => {
            console.log(`⏰ ${maxRunMinutes} minutes elapsed. Uploading session & stopping bot process...`);
            clearInterval(syncInterval);
            clearInterval(lockHeartbeatInterval);
            try { await uploadSessionToSupabase(sessionDir); } catch (_) {}
            try { await releaseBotLock(); } catch (_) {}
            child.kill('SIGTERM');
            setTimeout(() => {
                if (!child.killed) child.kill('SIGKILL');
                process.exit(0);
            }, 3000); // 3s escalation (down from 5s)
        }, maxRunMinutes * 60 * 1000);
    }

    child.on('error', (err) => {
        console.error('❌ Bot crashed with error:', err.message);
    });

    child.on('exit', async (code) => {
        clearInterval(syncInterval);
        clearInterval(lockHeartbeatInterval);
        console.log(`🤖 Bot process exited with code ${code}`);
        try { await uploadSessionToSupabase(sessionDir); } catch (_) {}
        try { await releaseBotLock(); } catch (_) {}
        process.exit(code || 0);
    });
}

startBot();