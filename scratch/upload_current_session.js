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
    if (fs.existsSync(sessionDir)) {
        if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
            const srcFile = path.join(sessionDir, file);
            const destFile = path.join(sessDir, file);
            if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, destFile);
            }
        }
    }
    const success = await uploadSessionToSupabase(sessDir);
    if (success) {
        console.log('🎉 Current session uploaded to Supabase successfully!');
    } else {
        console.error('❌ Failed to upload current session.');
    }
}

run().catch(console.error);
