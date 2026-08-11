const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;

// ═══ IMPORTANT ═══
// Only creds.json needs to be backed up to Supabase.
// All other session files (pre-key-*.json, session-*.json, sender-key-*.json, 
// app-state-*.json, etc.) are TEMPORARY and get recreated automatically by 
// the Baileys Signal protocol on each fresh connection.
// 
// Backing up those stale files and restoring them on next boot causes the
// Signal protocol to enter an infinite session-ratchet cleanup loop 
// ("Removing old closed session" spam x17000+ lines) that blocks the 
// Node.js event loop and prevents the bot from responding to any commands.
const ESSENTIAL_FILES = ['creds.json'];

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY missing from environment variables. Session sync disabled.');
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Uploads ONLY creds.json from sessionDir to Supabase bot_session table.
 * Pre-key, sender-key, and session files are NOT backed up — they are
 * temporary and get recreated automatically by Baileys on each connection.
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
            // Only backup essential files (creds.json)
            if (!ESSENTIAL_FILES.includes(file)) continue;
            
            const filePath = path.join(sessionDir, file);
            if (fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0) {
                const content = fs.readFileSync(filePath, 'utf-8');
                sessionData[file] = content;
            }
        }

        if (Object.keys(sessionData).length === 0) {
            console.warn('⚠️ No essential session files (creds.json) found, skipping upload.');
            return false;
        }

        // Delete all old records from bot_session first
        const { error: delError } = await supabase.from('bot_session').delete().neq('id', 0);
        if (delError) {
            console.warn('⚠️ Warning during deleting old session data:', delError.message);
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

        console.log(`✅ Uploaded session (${Object.keys(sessionData).length} essential file(s): ${Object.keys(sessionData).join(', ')}) to Supabase successfully.`);
        return true;
    } catch (err) {
        console.error('❌ Exception during Supabase session upload:', err.message || err);
        return false;
    }
}

/**
 * Downloads ONLY creds.json from Supabase bot_session table into sessionDir.
 * Even if old backups contain stale pre-key/session files, they are skipped.
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
        let skippedCount = 0;

        for (const [filename, content] of Object.entries(sessionFiles)) {
            // Only restore essential files — skip stale pre-key/session/sender-key files
            if (!ESSENTIAL_FILES.includes(filename)) {
                skippedCount++;
                continue;
            }
            const destPath = path.join(sessionDir, filename);
            fs.writeFileSync(destPath, content, 'utf-8');
            restoredCount++;
        }

        if (skippedCount > 0) {
            console.log(`🧹 Skipped ${skippedCount} stale session file(s) from Supabase backup (pre-keys, sessions, etc.)`);
        }
        console.log(`📁 Restored ${restoredCount} essential session file(s) from Supabase (Last updated: ${data.updated_at || 'unknown'})`);
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
