const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { uploadSessionToSupabase } = require('../src/Utils/supabaseSession');

async function run() {
    console.log('🚀 Uploading active WhatsApp session to Supabase...');
    const sessionDir = path.join(__dirname, '../session');
    const success = await uploadSessionToSupabase(sessionDir);
    if (success) {
        console.log('🎉 Current session uploaded to Supabase successfully!');
    } else {
        console.error('❌ Failed to upload current session.');
    }
}

run().catch(console.error);
