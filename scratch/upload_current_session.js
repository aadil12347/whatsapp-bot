const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { uploadSessionToSupabase } = require('../src/Utils/supabaseSession');

async function run() {
    console.log('🚀 Uploading WhatsApp paired keys to Supabase...');
    const sessionDir = path.join(__dirname, '../session');
    const sessDir = path.join(__dirname, '../sess');

    // Check if session directory exists and has files
    if (!fs.existsSync(sessionDir)) {
        console.warn('⚠️ session/ directory does not exist. Nothing to upload.');
        return;
    }

    const sessionFiles = fs.readdirSync(sessionDir).filter(f => {
        const fp = path.join(sessionDir, f);
        return fs.statSync(fp).isFile() && fs.statSync(fp).size > 0;
    });

    if (sessionFiles.length === 0) {
        console.warn('⚠️ session/ directory is empty. Nothing to upload.');
        return;
    }

    console.log(`📁 Found ${sessionFiles.length} session file(s) to upload.`);

    // Copy session/ → sess/ for upload
    if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
    for (const file of sessionFiles) {
        const srcFile = path.join(sessionDir, file);
        const destFile = path.join(sessDir, file);
        fs.copyFileSync(srcFile, destFile);
    }

    const success = await uploadSessionToSupabase(sessDir);
    if (success) {
        console.log('🎉 Current session uploaded to Supabase successfully!');
    } else {
        console.error('❌ Failed to upload current session.');
    }
}

run().catch(console.error);
