const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://huehhcytptarqtemqlky.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1ZWhoY3l0cHRhcnF0ZW1xbGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDY1NTAsImV4cCI6MjEwMTY4MjU1MH0.8gFBazTKSMkuZ_R9XKrb0oKavXahRNKCoiWkEHaT43M';

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('⚠️ Supabase URL or Key missing. Session sync disabled.');
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Uploads all files in sessionDir to Supabase bot_session table.
 */
async function uploadSessionToSupabase(sessionDir = path.join(__dirname, '../../session')) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return false;

        if (!fs.existsSync(sessionDir)) {
            console.warn('⚠️ Session directory does not exist:', sessionDir);
            return false;
        }

        const files = fs.readdirSync(sessionDir);
        if (files.length === 0) {
            console.warn('⚠️ Session directory is empty, skipping upload.');
            return false;
        }

        const sessionData = {};
        for (const file of files) {
            const filePath = path.join(sessionDir, file);
            if (fs.statSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath, 'utf-8');
                sessionData[file] = content;
            }
        }

        const payload = {
            id: 1,
            session_data: sessionData,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('bot_session')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            console.error('❌ Failed to upload session to Supabase:', error.message);
            return false;
        }

        console.log(`✅ Uploaded session (${Object.keys(sessionData).length} files) to Supabase successfully.`);
        return true;
    } catch (err) {
        console.error('❌ Exception during Supabase session upload:', err.message || err);
        return false;
    }
}

/**
 * Downloads session files from Supabase bot_session table into sessionDir.
 */
async function downloadSessionFromSupabase(sessionDir = path.join(__dirname, '../../session')) {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return false;

        const { data, error } = await supabase
            .from('bot_session')
            .select('session_data, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('❌ Failed to query Supabase bot_session:', error.message);
            return false;
        }

        if (!data || !data.session_data || Object.keys(data.session_data).length === 0) {
            console.log('ℹ️ No session data found in Supabase bot_session table.');
            return false;
        }

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const sessionFiles = data.session_data;
        let restoredCount = 0;

        for (const [filename, content] of Object.entries(sessionFiles)) {
            const destPath = path.join(sessionDir, filename);
            fs.writeFileSync(destPath, content, 'utf-8');
            restoredCount++;
        }

        console.log(`📁 Restored ${restoredCount} session files from Supabase (Last updated: ${data.updated_at || 'unknown'})`);
        return true;
    } catch (err) {
        console.error('❌ Exception during Supabase session download:', err.message || err);
        return false;
    }
}

module.exports = {
    uploadSessionToSupabase,
    downloadSessionFromSupabase
};
