const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { killPreviousInstances } = require('./src/Utils/singleInstance');
const { clearSupabaseSession } = require('./src/Utils/supabaseSession');

const SESSION_DIR = path.join(__dirname, 'session');
const SESS_ALT_DIR = path.join(__dirname, 'sess');

async function cleanAndPair() {
    console.log('🧹 =======================================================');
    console.log('🧹 CLEAN RE-PAIRING INITIALIZATION');
    console.log('🧹 Wiping all old session state & key ratchets...');
    console.log('🧹 =======================================================');

    try { killPreviousInstances(); } catch (_) {}

    // 1. Nuke local session directories
    for (const dir of [SESSION_DIR, SESS_ALT_DIR]) {
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`✅ Deleted local directory: ${path.basename(dir)}/`);
            } catch (err) {
                console.warn(`⚠️ Could not remove ${dir}:`, err.message);
            }
        }
    }

    // 2. Clear Supabase remote session storage
    try {
        await clearSupabaseSession();
    } catch (_) {}

    console.log('');
    console.log('🚀 Launching fresh pairing process...');
    console.log('-------------------------------------------------------');

    // 3. Launch pair.js directly
    const pairScript = path.join(__dirname, 'pair.js');
    const child = fork(pairScript, process.argv.slice(2), {
        stdio: 'inherit',
        windowsHide: true
    });

    child.on('exit', (code) => {
        if (code === 0) {
            console.log('\n🎉 Fresh pairing completed successfully! You can now run "node start.js"');
        } else {
            console.log(`\n❌ Pairing process exited with code ${code}. Please try running "node clean_pair.js" again.`);
        }
        process.exit(code || 0);
    });
}

cleanAndPair();
