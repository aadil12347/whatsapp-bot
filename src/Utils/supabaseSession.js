const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY missing from environment variables. Session sync disabled.');
        return null;
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

function isValidJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const stat = fs.statSync(filePath);
        if (stat.size === 0) return false;
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || content.trim().length === 0) return false;
        JSON.parse(content);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Uploads ONLY essential session files (creds.json, session-*.json, sender-key-*.json, app-state-sync-key-*.json)
 * from sessionDir to Supabase bot_session table.
 * Stale session files older than 30 days are pruned locally and skipped.
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
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        let prunedCount = 0;

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            const isCreds = file === 'creds.json';
            const isSession = file.startsWith('session-');
            const isSenderKey = file.startsWith('sender-key-');
            const isAppState = file.startsWith('app-state-sync-key-');
            
            // Skip non-essential files entirely
            if (!isCreds && !isSession && !isSenderKey && !isAppState) {
                continue;
            }

            const filePath = path.join(sessionDir, file);
            if (isValidJsonFile(filePath)) {
                try {
                    const stat = fs.statSync(filePath);
                    // Prune files older than 30 days (excluding creds.json)
                    if (!isCreds && (now - stat.mtimeMs > thirtyDays)) {
                        fs.unlinkSync(filePath);
                        prunedCount++;
                        continue;
                    }

                    const content = fs.readFileSync(filePath, 'utf-8');
                    sessionData[file] = {
                        content,
                        mtime: stat.mtimeMs
                    };
                } catch (_) {}
            }
        }

        if (prunedCount > 0) {
            console.log(`🧹 Pruned ${prunedCount} stale session file(s) older than 30 days from memory/disk during upload.`);
        }

        if (Object.keys(sessionData).length === 0 || !sessionData['creds.json']) {
            console.warn('⚠️ No valid creds.json found in session directory, skipping upload.');
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

        console.log(`✅ Uploaded session (${Object.keys(sessionData).length} essential file(s)) to Supabase successfully.`);
        return true;
    } catch (err) {
        console.error('❌ Exception during Supabase session upload:', err.message || err);
        return false;
    }
}

/**
 * Downloads session files from Supabase and restores them into sessionDir.
 * Handles both plain-string and metadata-object (with mtime) payload formats.
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
        const localCredsExist = isValidJsonFile(path.join(sessionDir, 'creds.json'));
        let restoredCount = 0;

        for (const [filename, value] of Object.entries(sessionFiles)) {
            if (!filename.endsWith('.json') || !value) continue;
            
            const isCreds = filename === 'creds.json';
            const isSession = filename.startsWith('session-');
            const isSenderKey = filename.startsWith('sender-key-');
            const isAppState = filename.startsWith('app-state-sync-key-');
            
            if (!isCreds && !isSession && !isSenderKey && !isAppState) {
                continue;
            }

            const destPath = path.join(sessionDir, filename);
            let content = '';
            let mtime = null;

            if (typeof value === 'string') {
                content = value;
            } else if (value && typeof value === 'object' && value.content) {
                content = value.content;
                mtime = value.mtime;
            } else {
                continue;
            }

            // If local creds already exist and local session file is present and newer, skip overwriting
            if (localCredsExist && fs.existsSync(destPath)) {
                try {
                    const localStat = fs.statSync(destPath);
                    if (mtime && localStat.mtimeMs >= mtime) {
                        continue; // Keep newer local session file
                    }
                } catch (_) {}
            }

            fs.writeFileSync(destPath, content, 'utf-8');
            if (mtime) {
                try {
                    const time = new Date(mtime);
                    fs.utimesSync(destPath, time, time);
                } catch (_) {}
            }
            restoredCount++;
        }

        console.log(`📁 Restored ${restoredCount} essential session file(s) from Supabase (Last updated: ${data.updated_at || 'unknown'})`);
        return true;
    } catch (err) {
        console.error('❌ Exception during Supabase session download:', err.message || err);
        return false;
    }
}

async function clearSupabaseSession() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return false;
        const { error } = await supabase.from('bot_session').delete().neq('id', 0);
        if (error) {
            console.warn('⚠️ Warning clearing Supabase session table:', error.message);
            return false;
        }
        console.log('🧹 Cleared all remote session data from Supabase bot_session table.');
        return true;
    } catch (e) {
        console.warn('⚠️ Error clearing Supabase session:', e.message);
        return false;
    }
}

module.exports = {
    uploadSessionToSupabase,
    downloadSessionFromSupabase,
    clearSupabaseSession
};

