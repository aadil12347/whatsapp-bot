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

async function startBot() {
    console.log('🚀 Starting your custom DanieWatch Downloader Bot...');

    // Auto-download latest session from Supabase if available
    try {
        await downloadSessionFromSupabase(path.join(__dirname, 'sess'));
        const sessDir = path.join(__dirname, 'sess');
        const sessionDir = path.join(__dirname, 'session');
        if (fs.existsSync(sessDir)) {
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            const files = fs.readdirSync(sessDir);
            for (const file of files) {
                const srcFile = path.join(sessDir, file);
                const destFile = path.join(sessionDir, file);
                if (fs.statSync(srcFile).isFile()) {
                    fs.copyFileSync(srcFile, destFile);
                }
            }
        }
    } catch (e) {
        console.warn('⚠️ Note: Supabase session sync skipped or failed:', e.message || e);
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

    const botBrainPath = path.join(__dirname, 'queen.js');

    if (!fs.existsSync(botBrainPath)) {
        console.error('❌ Error: queen.js is missing! Please make sure the brain file is in the folder.');
        process.exit(1);
    }

    // Start the bot process
    const child = fork(botBrainPath, [], {
        stdio: 'inherit',
        windowsHide: true
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