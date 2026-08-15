const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from config.env
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✅ Loaded config.env successfully.');
} else {
    console.error('❌ config.env file not found!');
    process.exit(1);
}

const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase credentials missing in config.env! Ensure URL/SUPABASE_URL and KEY/SUPABASE_KEY are set.');
    process.exit(1);
}

async function run() {
    console.log('Connecting to Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log('Deleting all session data from bot_session table...');
    const { data, error } = await supabase
        .from('bot_session')
        .delete()
        .neq('id', 0); // Delete all entries

    if (error) {
        console.error('❌ Failed to clear Supabase bot_session table:', error.message);
    } else {
        console.log('✅ Supabase bot_session table cleared successfully.');
    }

    // Nuke local session directories
    const sessionDir = path.join(__dirname, '../session');
    const sessDir = path.join(__dirname, '../sess');

    console.log('Nuking local session folders...');
    for (const dir of [sessionDir, sessDir]) {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`🧹 Deleted local folder: ${dir}`);
            }
        } catch (e) {
            console.error(`⚠️ Failed to delete ${dir}:`, e.message);
        }
    }

    console.log('🎉 Cleanup complete. Ready for fresh pairing!');
}

run().catch(err => {
    console.error('Fatal error during cleanup:', err);
    process.exit(1);
});
