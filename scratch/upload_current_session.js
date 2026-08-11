const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { uploadSessionToSupabase } = require('../src/Utils/supabaseSession');

// Only creds.json is essential — everything else is temporary
const ESSENTIAL_FILES = ['creds.json'];

async function run() {
    console.log('🚀 Uploading WhatsApp paired keys to Supabase...');
    const sessionDir = path.join(__dirname, '../session');
    const sessDir = path.join(__dirname, '../sess');

    // Check if session directory exists and has creds.json
    if (!fs.existsSync(sessionDir)) {
        console.warn('⚠️ session/ directory does not exist. Nothing to upload.');
        return;
    }

    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath) || fs.statSync(credsPath).size === 0) {
        console.warn('⚠️ session/creds.json not found or empty. Nothing to upload.');
        return;
    }

    console.log('📁 Found creds.json to upload (only essential file needed).');

    // Copy ONLY creds.json to sess/ for upload
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
    
    // Clean sess/ first to avoid uploading stale files
    for (const file of fs.readdirSync(sessDir)) {
        const fp = path.join(sessDir, file);
        if (fs.statSync(fp).isFile() && !ESSENTIAL_FILES.includes(file)) {
            try { fs.unlinkSync(fp); } catch (_) {}
        }
    }
    
    fs.copyFileSync(credsPath, path.join(sessDir, 'creds.json'));

    const success = await uploadSessionToSupabase(sessDir);
    if (success) {
        console.log('🎉 Current session uploaded to Supabase successfully!');
    } else {
        console.error('❌ Failed to upload current session.');
    }
}

run().catch(console.error);

