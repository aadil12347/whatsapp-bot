const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } = require('anju-xpro-baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}
const { uploadSessionToSupabase, clearSupabaseSession } = require('./src/Utils/supabaseSession');

const SESSION_DIR = path.join(__dirname, 'session');
const SESS_ALT_DIR = path.join(__dirname, 'sess');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function syncSessionFiles() {
    try {
        if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
        
        const copyDir = (src, dest) => {
            if (!fs.existsSync(src)) return;
            const files = fs.readdirSync(src);
            for (const file of files) {
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                if (fs.statSync(srcFile).isFile()) {
                    fs.copyFileSync(srcFile, destFile);
                }
            }
        };

        copyDir(SESSION_DIR, SESS_ALT_DIR);
        copyDir(SESS_ALT_DIR, SESSION_DIR);
    } catch(e) {}
}

/**
 * Checks if a file is corrupted (null bytes, empty, or invalid JSON).
 * Returns true if the file is valid, false if corrupted/missing.
 */
function isSessionFileValid(filePath) {
    try {
        if (!fs.existsSync(filePath)) return false;
        const stat = fs.statSync(filePath);
        if (stat.size === 0) return false;
        
        const rawBuffer = fs.readFileSync(filePath);
        const checkLen = Math.min(rawBuffer.length, 10);
        let allNull = true;
        for (let i = 0; i < checkLen; i++) {
            if (rawBuffer[i] !== 0) { allNull = false; break; }
        }
        if (allNull) return false;

        const rawData = rawBuffer.toString('utf-8');
        JSON.parse(rawData);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Aggressively nuke both session directories and Supabase remote table for a guaranteed clean slate.
 */
async function nukeAllSessions() {
    console.log('🧹 Nuking all session data (local + Supabase) for a clean fresh start...');
    for (const dir of [SESSION_DIR, SESS_ALT_DIR]) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
    try {
        await clearSupabaseSession();
    } catch (_) {}
}

/**
 * Checks session creds — cleans up if corrupted, unregistered, or stale.
 */
function checkAndCleanSession() {
    const credsFile = path.join(SESSION_DIR, 'creds.json');
    const sessCredsFile = path.join(SESS_ALT_DIR, 'creds.json');
    
    // Check both session dirs for corruption
    const sessionValid = isSessionFileValid(credsFile);
    const sessValid = isSessionFileValid(sessCredsFile);
    
    if (!sessionValid && !sessValid) {
        // Both are missing or corrupted — nuke everything
        nukeAllSessions();
        return;
    }
    
    // If session creds exist and are valid, check if registered
    if (sessionValid) {
        try {
            const rawData = fs.readFileSync(credsFile, 'utf-8');
            const credsData = JSON.parse(rawData);
            if (!credsData.registered) {
                console.log('🧹 Purging old incomplete (unregistered) session for fresh pairing...');
                nukeAllSessions();
            }
        } catch (e) {
            console.log('🧹 Purging corrupted session (parse error)...');
            nukeAllSessions();
        }
    } else {
        // session/ creds corrupted but sess/ might be OK — nuke session/ only
        console.log('🧹 session/creds.json is corrupted, cleaning...');
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
    }
}

let pairingRetries = 0;
const MAX_PAIRING_RETRIES = 3;

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}

    if (cleanStart) {
        pairingRetries = 0;
        // Always force-nuke on a fresh start to guarantee clean pairing
        await nukeAllSessions();
    }

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });

    let botNumber = process.argv[2] || process.env.NUMBER || process.env.BOT_NUMBER;
    
    if (!botNumber || botNumber.includes('your account') || botNumber.trim() === '') {
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        botNumber = await new Promise((resolve) => {
            rl.question('📱 Enter your WhatsApp phone number with country code (e.g. 923013068663): ', (ans) => {
                rl.close();
                resolve(ans);
            });
        });
    }

    if (!botNumber || botNumber.trim() === '') {
        console.log('❌ No valid phone number provided! Exiting.');
        process.exit(1);
    }

    botNumber = botNumber.replace(/[^0-9]/g, '');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    console.log(`📡 Baileys version: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        browser: Browsers.appropriate('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        syncSessionFiles();
    });
    
    console.log(`🤖 Target Phone Number: +${botNumber}`);
    console.log('⏳ Connecting to WhatsApp servers...');

    let pairingCodeRequested = false;
    let pairingCodeTimeout = null;

    if (!sock.authState.creds.registered) {
        // Wait for the WS to actually connect before requesting pairing code
        // Use a delay of 5s to let the WebSocket handshake complete
        pairingCodeTimeout = setTimeout(async () => {
            if (pairingCodeRequested) return;
            pairingCodeRequested = true;
            try {
                console.log('⏳ Requesting fresh pairing code from WhatsApp...');
                let code = await sock.requestPairingCode(botNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('');
                console.log('╔═══════════════════════════════════════════╗');
                console.log(`║  🔑 YOUR PAIRING CODE:  ${code.toUpperCase()}          ║`);
                console.log('╠═══════════════════════════════════════════╣');
                console.log('║                                           ║');
                console.log('║  1. Open WhatsApp on your phone           ║');
                console.log('║  2. Settings → Linked Devices             ║');
                console.log('║  3. Tap "Link a Device"                   ║');
                console.log('║  4. Tap "Link with phone number instead"  ║');
                console.log('║  5. Enter the code shown above            ║');
                console.log('║                                           ║');
                console.log('╚═══════════════════════════════════════════╝');
                console.log('');
                console.log('⏳ Waiting for you to enter the code... (you have ~60 seconds)');
            } catch (err) {
                console.error('❌ Failed to get pairing code:', err.message || err);
                if (err.message && (err.message.includes('rate') || err.message.includes('too many'))) {
                    console.log('💡 WhatsApp rate-limited you. Wait at least 60 seconds before retrying.');
                } else {
                    console.log('💡 Try running the pairing script again after a few seconds.');
                }
            }
        }, 5000);
    } else {
        console.log('✅ Session already registered — connecting with existing creds...');
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            // Clear any pending pairing code timeout
            if (pairingCodeTimeout) clearTimeout(pairingCodeTimeout);
            
            console.log('');
            console.log('=========================================');
            console.log('🎉 SUCCESS! WhatsApp Connected!');
            await saveCreds();
            await delay(1000);
            syncSessionFiles();
            console.log('☁️ Uploading fresh paired session keys to Supabase...');
            try {
                await uploadSessionToSupabase(SESSION_DIR);
                console.log('✅ Session uploaded to Supabase successfully.');
            } catch (uploadErr) {
                console.warn('⚠️ Supabase upload failed:', uploadErr.message || uploadErr);
            }
            await delay(2000);
            process.exit(0);
        }
        
        if (connection === 'close') {
            // Clear any pending pairing code timeout
            if (pairingCodeTimeout) clearTimeout(pairingCodeTimeout);
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMsg = lastDisconnect?.error?.message || '';
            
            console.log(`⚠️ Connection closed — Status: ${statusCode || 'unknown'}, Message: ${errorMsg || 'none'}`);
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                if (!sock.authState.creds.registered) {
                    console.log('❌ Pairing rejected or rate-limited (Code: 401). Clearing session...');
                    console.log('💡 Wait 30-60 seconds before trying again to avoid WhatsApp rate limits.');
                    nukeAllSessions();
                    process.exit(1);
                }
                console.log('❌ Logged out by WhatsApp. Clearing session...');
                nukeAllSessions();
                process.exit(1);
            } else if (statusCode === 515 || sock.authState.creds.registered) {
                // 515 = stream replaced / normal reconnect after successful pairing
                console.log(`🔄 Handshake complete (Code: ${statusCode}). Finalizing login...`);
                await delay(2000);
                startPairing(false);
            } else if (statusCode === 428 || statusCode === 408) {
                // 428 = pairing code expired, 408 = QR/connection timeout — retry with exponential backoff
                pairingRetries++;
                if (pairingRetries > MAX_PAIRING_RETRIES) {
                    console.log(`❌ Pairing timed out after ${MAX_PAIRING_RETRIES} retries. Please try again later.`);
                    nukeAllSessions();
                    process.exit(1);
                }
                const backoffSec = 5 * Math.pow(2, pairingRetries - 1); // 5s, 10s, 20s
                console.log(`⏳ Pairing code expired (attempt ${pairingRetries}/${MAX_PAIRING_RETRIES}). Retrying in ${backoffSec}s...`);
                nukeAllSessions();
                await delay(backoffSec * 1000);
                startPairing(false);
            } else {
                console.log(`🔄 Unexpected disconnect (Code: ${statusCode || 'unknown'}). Exiting.`);
                process.exit(1);
            }
        }
    });
}

startPairing(true).catch(err => {
    console.error('Fatal error starting pairing:', err);
    process.exit(1);
});
