const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    try { require('dotenv').config({ path: envPath }); } catch (_) {}
}

const { uploadSessionToSupabase } = require('../src/Utils/supabaseSession');

function isValidCredsFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const stat = fs.statSync(filePath);
        if (stat.size === 0) return false;
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || !content.trim()) return false;
        const parsed = JSON.parse(content);
        return !!(parsed && (parsed.me || parsed.registered !== false));
    } catch (_) {
        return false;
    }
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

async function runUpload() {
    console.log('☁️ [SessionBackup] Initiating session backup to Supabase...');

    const rootDir = path.join(__dirname, '..');
    const sessionDir = path.join(rootDir, 'session');
    const sessDir = path.join(rootDir, 'sess');

    const sessionCreds = path.join(sessionDir, 'creds.json');
    const sessCreds = path.join(sessDir, 'creds.json');

    const sessionValid = isValidCredsFile(sessionCreds);
    const sessValid = isValidCredsFile(sessCreds);

    let targetDir = null;

    if (sessionValid) {
        targetDir = sessionDir;
        // Mirror session to sess as backup
        syncDirectories(sessionDir, sessDir);
    } else if (sessValid) {
        console.log('🔄 [SessionBackup] session/creds.json invalid/missing — restoring from sess/ backup...');
        syncDirectories(sessDir, sessionDir);
        targetDir = sessionDir;
    }

    if (!targetDir || !isValidCredsFile(path.join(targetDir, 'creds.json'))) {
        console.warn('⚠️ [SessionBackup] No valid creds.json found in session/ or sess/ — skipping upload.');
        process.exit(0);
    }

    try {
        const success = await uploadSessionToSupabase(targetDir);
        if (success) {
            console.log('✅ [SessionBackup] Paired session keys safely uploaded to Supabase!');
        } else {
            console.warn('⚠️ [SessionBackup] Supabase upload returned false.');
        }
    } catch (err) {
        console.error('❌ [SessionBackup] Error during Supabase upload:', err.message || err);
    }

    // Flush any daily releases pending
    try {
        const { shutdownSync } = require('../src/Utils/daily_releases');
        if (shutdownSync) await shutdownSync();
    } catch (_) {}

    process.exit(0);
}

runUpload();
