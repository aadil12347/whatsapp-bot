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

function isEssentialSessionFile(file) {
    if (!file || typeof file !== 'string' || !file.endsWith('.json')) return false;
    return file === 'creds.json' ||
           file === 'active_chats.json' ||
           file === 'download_settings.json' ||
           file.startsWith('session-') ||
           file.startsWith('sender-key-') ||
           file.startsWith('pre-key-') ||
           file.startsWith('identity-key-') ||
           file.startsWith('lid-mapping-') ||
           file.startsWith('device-list-') ||
           file.startsWith('app-state-sync-');
}

/**
 * Files safe to sync to/from Supabase.
 * Preserves creds, settings, pre-keys, and active Signal E2EE ratchet sessions
 * (session-*, sender-key-*, identity-key-*) exactly like ANJU-XPRO-V5.
 */
function isSyncableSessionFile(file) {
    if (!file || typeof file !== 'string' || !file.endsWith('.json')) return false;
    return file === 'creds.json' ||
           file === 'active_chats.json' ||
           file === 'download_settings.json' ||
           file.startsWith('session-') ||
           file.startsWith('sender-key-') ||
           file.startsWith('identity-key-') ||
           file.startsWith('pre-key-') ||
           file.startsWith('lid-mapping-') ||
           file.startsWith('device-list-') ||
           file.startsWith('app-state-sync-');
}

/**
 * Uploads session files (excluding ratchet state & excess pre-keys) from sessionDir to Supabase.
 * Stale pre-key files beyond the 10 newest are pruned locally and remotely.
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

        // Keep up to 100 pre-key files to prevent Signal E2EE handshake failures
        const preKeyFiles = files.filter(f => f.startsWith('pre-key-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(sessionDir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch(_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        let prunedCount = 0;
        if (preKeyFiles.length > 100) {
            const toDelete = preKeyFiles.slice(100);
            for (const item of toDelete) {
                try { fs.unlinkSync(item.path); prunedCount++; } catch (_) {}
            }
        }

        // Keep up to 100 app-state-sync keys
        const appStateFiles = files.filter(f => f.startsWith('app-state-sync-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(sessionDir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch(_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        if (appStateFiles.length > 100) {
            const toDelete = appStateFiles.slice(100);
            for (const item of toDelete) {
                try { fs.unlinkSync(item.path); prunedCount++; } catch (_) {}
            }
        }

        // Keep up to 100 active session ratchets
        const sessionRatchetFiles = files.filter(f => f.startsWith('session-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(sessionDir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch(_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        if (sessionRatchetFiles.length > 100) {
            const toDelete = sessionRatchetFiles.slice(100);
            for (const item of toDelete) {
                try { fs.unlinkSync(item.path); prunedCount++; } catch (_) {}
            }
        }

        // Keep up to 100 sender keys
        const senderKeyFiles = files.filter(f => f.startsWith('sender-key-') && f.endsWith('.json'))
            .map(f => {
                const fp = path.join(sessionDir, f);
                try { return { file: f, path: fp, mtime: fs.statSync(fp).mtimeMs }; } catch(_) { return null; }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime - a.mtime);

        if (senderKeyFiles.length > 100) {
            const toDelete = senderKeyFiles.slice(100);
            for (const item of toDelete) {
                try { fs.unlinkSync(item.path); prunedCount++; } catch (_) {}
            }
        }

        const currentFiles = fs.readdirSync(sessionDir);
        const sessionData = {};

        for (const file of currentFiles) {
            if (!file.endsWith('.json')) continue;
            
            if (!isSyncableSessionFile(file)) {
                continue;
            }

            const filePath = path.join(sessionDir, file);
            if (isValidJsonFile(filePath)) {
                try {
                    const stat = fs.statSync(filePath);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    sessionData[file] = {
                        content,
                        mtime: stat.mtimeMs
                    };
                } catch (_) {}
            }
        }

        if (prunedCount > 0) {
            console.log(`🧹 Pruned ${prunedCount} excess pre-key/app-state/ratchet session file(s) before upload.`);
        }

        if (Object.keys(sessionData).length === 0 || !sessionData['creds.json']) {
            console.warn('⚠️ No valid creds.json found in session directory, skipping upload.');
            return false;
        }

        try {
            const credsObj = JSON.parse(typeof sessionData['creds.json'] === 'string' ? sessionData['creds.json'] : sessionData['creds.json'].content || '{}');
            if (credsObj.me && credsObj.me.id) {
                // If bot identity exists, session is paired and registered
                credsObj.registered = true;
                sessionData['creds.json'].content = JSON.stringify(credsObj, null, 2);
            } else if (credsObj.registered === false) {
                console.warn('⚠️ creds.json is marked as registered: false (logged out). Aborting Supabase upload to preserve valid remote credentials.');
                return false;
            }
        } catch (_) {}

        // ATOMIC UPSERT: Never delete before upserting — ON CONFLICT (id) safely replaces row 1
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

        // Try primary session row (id=1)
        let { data, error } = await supabase
            .from('bot_session')
            .select('session_data, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('❌ Failed to query Supabase bot_session:', error.message);
        }

        // Resilient fallback: if id=1 is missing or lacks creds.json, check any recent row (excluding lock id=2)
        if (!data || !data.session_data || !data.session_data['creds.json']) {
            const { data: fallbackRows, error: fallbackErr } = await supabase
                .from('bot_session')
                .select('session_data, updated_at')
                .neq('id', 2)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!fallbackErr && fallbackRows && fallbackRows.length > 0 && fallbackRows[0].session_data?.['creds.json']) {
                console.log('🔄 Fallback: Restoring session data from alternate Supabase record.');
                data = fallbackRows[0];
            }
        }

        if (!data || !data.session_data || Object.keys(data.session_data).length === 0 || !data.session_data['creds.json']) {
            console.log('ℹ️ No session data found in Supabase bot_session table.');
            return false;
        }

        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Clean out any 0-byte or corrupted creds.json so it doesn't block restore
        const localCredsPath = path.join(sessionDir, 'creds.json');
        if (fs.existsSync(localCredsPath) && !isValidJsonFile(localCredsPath)) {
            try { fs.unlinkSync(localCredsPath); } catch (_) {}
        }

        const sessionFiles = data.session_data;
        const localCredsExist = isValidJsonFile(localCredsPath);
        let restoredCount = 0;

        for (const [filename, value] of Object.entries(sessionFiles)) {
            if (!filename.endsWith('.json') || !value) continue;
            
            if (!isSyncableSessionFile(filename)) {
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

        // Also mirror restored files to sess/ backup directory
        const sessAltDir = path.join(sessionDir, '..', 'sess');
        if (fs.existsSync(sessAltDir) || restoredCount > 0) {
            try {
                if (!fs.existsSync(sessAltDir)) fs.mkdirSync(sessAltDir, { recursive: true });
                const files = fs.readdirSync(sessionDir);
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        fs.copyFileSync(path.join(sessionDir, f), path.join(sessAltDir, f));
                    }
                }
            } catch (_) {}
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
        // ONLY delete session row id=1 (never delete bot lock id=2)
        const { error } = await supabase.from('bot_session').delete().eq('id', 1);
        if (error) {
            console.warn('⚠️ Warning clearing Supabase session row:', error.message);
            return false;
        }
        console.log('🧹 Cleared remote session data (id=1) from Supabase bot_session table.');
        return true;
    } catch (e) {
        console.warn('⚠️ Error clearing Supabase session:', e.message);
        return false;
    }
}

/**
 * Acquire a distributed bot lock using bot_session id=2.
 * If another instance has a heartbeat less than 3 minutes old, throws an error.
 * Otherwise, claims the lock with the current timestamp.
 */
async function acquireBotLock() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) {
            console.warn('[BotLock] Supabase not configured — skipping lock.');
            return true;
        }

        // Check for existing lock
        const { data, error: fetchErr } = await supabase
            .from('bot_session')
            .select('session_data, updated_at')
            .eq('id', 2)
            .maybeSingle();

        if (fetchErr) {
            console.warn('[BotLock] Error checking lock:', fetchErr.message);
            // Proceed anyway — better to risk overlap than to never start
            return true;
        }

        if (data && data.session_data && data.session_data.heartbeat_at) {
            const lastHeartbeat = new Date(data.session_data.heartbeat_at).getTime();
            const age = Date.now() - lastHeartbeat;
            const THREE_MINUTES = 3 * 60 * 1000;

            if (age < THREE_MINUTES) {
                const ageSec = Math.round(age / 1000);
                throw new Error(`Another bot instance is still active (heartbeat ${ageSec}s ago). Waiting...`);
            }

            console.log(`[BotLock] Previous lock expired (${Math.round(age / 1000)}s ago). Claiming lock...`);
        }

        // Claim the lock
        const now = new Date().toISOString();
        const { error: upsertErr } = await supabase
            .from('bot_session')
            .upsert({
                id: 2,
                session_data: { locked_at: now, heartbeat_at: now, pid: process.pid },
                updated_at: now
            }, { onConflict: 'id' });

        if (upsertErr) {
            console.warn('[BotLock] Error claiming lock:', upsertErr.message);
            return true; // Proceed anyway
        }

        console.log('[BotLock] ✅ Bot lock acquired successfully.');
        return true;
    } catch (err) {
        if (err.message.includes('Another bot instance')) {
            throw err; // Re-throw so caller can retry
        }
        console.warn('[BotLock] Unexpected error:', err.message);
        return true; // Proceed anyway on unexpected errors
    }
}

/**
 * Update the bot lock heartbeat timestamp.
 * Called periodically (every 60s) to signal the bot is still alive.
 */
async function heartbeatBotLock() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const now = new Date().toISOString();
        await supabase
            .from('bot_session')
            .update({
                session_data: { locked_at: now, heartbeat_at: now, pid: process.pid },
                updated_at: now
            })
            .eq('id', 2);
    } catch (_) {}
}

/**
 * Release the bot lock on shutdown.
 * Sets the heartbeat to epoch (1970) so the next instance won't wait.
 */
async function releaseBotLock() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { error } = await supabase
            .from('bot_session')
            .upsert({
                id: 2,
                session_data: { locked_at: null, heartbeat_at: '1970-01-01T00:00:00.000Z', pid: null },
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (!error) {
            console.log('[BotLock] 🔓 Bot lock released.');
        }
    } catch (_) {}
}

module.exports = {
    uploadSessionToSupabase,
    downloadSessionFromSupabase,
    clearSupabaseSession,
    acquireBotLock,
    releaseBotLock,
    heartbeatBotLock
};

