const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { uploadSessionToSupabase, clearSupabaseSession } = require('../src/Utils/supabaseSession');

async function run() {
    console.log('🚀 Uploading WhatsApp paired session keys to Supabase...');
    const sessionDir = path.join(__dirname, '../session');
    const sessDir = path.join(__dirname, '../sess');

    if (!fs.existsSync(sessionDir)) {
        console.warn('⚠️ session/ directory does not exist. Nothing to upload.');
        return;
    }

    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath) || fs.statSync(credsPath).size === 0) {
        console.warn('⚠️ session/creds.json not found or empty. Nothing to upload.');
        return;
    }

    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
    
    // Copy all valid session files to sess/ for backup/upload
    const files = fs.readdirSync(sessionDir);
    let count = 0;
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const srcFp = path.join(sessionDir, file);
        const destFp = path.join(sessDir, file);
        if (fs.statSync(srcFp).isFile() && fs.statSync(srcFp).size > 0) {
            fs.copyFileSync(srcFp, destFp);
            count++;
        }
    }
    console.log(`📁 Copied ${count} session file(s) from session/ to sess/ for upload.`);

    console.log('🧹 Clearing old remote session data from Supabase...');
    await clearSupabaseSession();

    const success = await uploadSessionToSupabase(sessionDir);
    if (success) {
        console.log('🎉 Current session uploaded to Supabase successfully!');
    } else {
        console.error('❌ Failed to upload current session.');
    }
}

run().catch(console.error);


