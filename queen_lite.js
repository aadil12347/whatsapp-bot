// ═══════════════════════════════════════════════════════════════════════
//  queen_lite.js — DanieWatch Bot Core Engine
//  100% ANJU-XPRO-V5 Connection Architecture + DanieWatch Command Handover
//
//  Flow:
//    1. Fetch session keys from Supabase → ./session/
//    2. Initialize Baileys socket (ANJU-XPRO-V5 config)
//    3. On connection open → hand over conn to DanieWatch commands
//    4. On disconnect → auto-reconnect using ANJU-XPRO-V5 status code logic
// ═══════════════════════════════════════════════════════════════════════

require('./_suppress_session_logs');

// ── Process-level error handling for Signal Bad MAC errors ──
process.on('uncaughtException', (err) => {
    if (err && err.message && err.message.includes('Bad MAC')) {
        return; // Handled by _suppress_session_logs auto-repair
    }
    console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    const msg = (reason && reason.message) || String(reason || '');
    if (msg.includes('Bad MAC')) {
        return; // Handled by _suppress_session_logs auto-repair
    }
    console.error('❌ Unhandled Rejection:', reason);
});

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    Browsers,
    proto,
    getContentType,
    DisconnectReason
} = require('anju-xpro-baileys');

// Load config
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const { uploadSessionToSupabase, downloadSessionFromSupabase } = require('./src/Utils/supabaseSession');
const { isAntilinkActiveForGroup, containsForbiddenLink } = require('./src/Utils/antilink');
const { recordMessageAndCheckSpam, isAntispamActiveForGroup } = require('./src/Utils/antispam');

const sess = require('./session');
const SESSION_DIR = path.join(__dirname, 'session');

// ── Logger (silent — ANJU-XPRO-V5 style) ──
const logger = pino({ level: 'silent' });

// ── Message retry cache (ANJU-XPRO-V5 style) ──
const msgRetryCounterCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// ── Proto message cache for retry decryption ──
// When Baileys fails to decrypt and retries, it calls getMessage() to get the original proto.
// We cache message protos here so retries can succeed.
const msgProtoCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ── Admin immunity cache (60s TTL) for Anti-Link and Anti-Spam ──
const groupAdminCache = new Map();

async function checkIsGroupAdmin(conn, groupJid, senderJid) {
    if (!senderJid || !groupJid) return false;
    const cleanSender = senderJid.split('@')[0].split(':')[0].trim();

    // Bot Owner is always immune
    if (cleanSender === '923013068663') return true;

    try {
        const now = Date.now();
        let cached = groupAdminCache.get(groupJid);

        let participantsMap;
        if (cached && (now - cached.timestamp < 60000)) {
            participantsMap = cached.participantsMap;
        } else {
            const metadata = await conn.groupMetadata(groupJid);
            participantsMap = new Map();
            if (metadata && metadata.participants) {
                metadata.participants.forEach(p => {
                    const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
                    participantsMap.set(p.id, isAdm);
                    if (p.lid) participantsMap.set(p.lid, isAdm);
                    const pNum = p.id.split('@')[0];
                    participantsMap.set(pNum, isAdm);
                });
            }
            groupAdminCache.set(groupJid, { participantsMap, timestamp: now });
        }

        const isAdmin = participantsMap.get(senderJid) || participantsMap.get(cleanSender);
        return !!isAdmin;
    } catch (err) {
        console.error(`[AdminCheck] Error checking admin status for ${senderJid} in ${groupJid}:`, err.message);
        return false;
    }
}

// ── State ──
let conn = null;
let startupMessageSent = false;
let _connectTime = 0; // Timestamp when connection opened — used for startup grace period
let _connectTimeSeconds = 0; // Epoch timestamp (in seconds) when connection opened

// ── Auto-restart timer ──
const AUTO_RESTART_MINUTES = parseInt(process.env.MAX_RUN_TIME_MINUTES || '0', 10);

// ══════════════════════════════════════════════════════════════════════
//  MAIN CONNECTION FUNCTION — 100% ANJU-XPRO-V5 CONNECTION ENGINE
// ══════════════════════════════════════════════════════════════════════
async function connectToWA() {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    // ── Step 1: Check/Fetch session keys from Supabase if missing ──
    const credsPath = path.join(SESSION_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) {
        try {
            console.log('☁️ Fetching session keys from Supabase...');
            const downloaded = await downloadSessionFromSupabase(SESSION_DIR);
            if (downloaded) {
                console.log('✅ Session keys loaded from Supabase successfully.');
            }
        } catch (e) {
            console.warn('⚠️ Supabase session fetch failed (non-fatal):', e.message || e);
        }
    }

    // Check if creds.json exists — if not, prompt for CLI pairing
    if (!fs.existsSync(credsPath)) {
        console.error('❌ No creds.json found in session/ directory or Supabase.');
        console.error('   Run "npm run pair" or "node pair.js" to generate a fresh pairing code first.');
        console.error('   The bot cannot connect without valid session credentials.');
        process.exit(1);
    }

    // ── Step 2: Initialize Baileys auth state (ANJU-XPRO-V5 style) ──
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    // ── Step 3: Create Baileys WebSocket (100% ANJU-XPRO-V5 parameters) ──
    conn = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: Browsers.ubuntu('Chrome'),
        msgRetryCounterCache,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
        // Prevent offline message flood & history sync churn — prevents 30-50 min delay
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        downloadHistory: false,
        markOnlineOnConnect: false,
        fireInitQueries: false,
        shouldIgnoreJid: (jid) => jid?.endsWith('@newsletter') || jid?.endsWith('@broadcast'),
        retryRequestDelayMs: 5000, // Slower retries to reduce E2EE renegotiation storm
        getMessage: async (key) => {
            const cached = msgProtoCache.get(key.id);
            if (cached) return cached;
            return { conversation: null };
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  CREDENTIAL PERSISTENCE — Save locally on update
    // ══════════════════════════════════════════════════════════════════
    conn.ev.on('creds.update', saveCreds);

    // ══════════════════════════════════════════════════════════════════
    //  CONNECTION LIFECYCLE — 100% ANJU-XPRO-V5 STATUS CODE HANDLING
    // ══════════════════════════════════════════════════════════════════
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // ── CONNECTION OPEN: Handover to DanieWatch ──
        if (connection === 'open') {
            _connectTime = Date.now();
            _connectTimeSeconds = Math.floor(_connectTime / 1000);
            conn._startupTime = _connectTime;
            conn._connectTimeSeconds = _connectTimeSeconds;
            console.log('🔥 DanieWatch Bot connected via ANJU-XPRO-V5 engine ✅');

            // Log bot identity for debugging owner/LID matching
            if (conn.user) {
                console.log(`[DanieWatch] 🆔 Bot identity: id=${conn.user.id || 'N/A'}, lid=${conn.user.lid || 'N/A'}, name=${conn.user.name || 'N/A'}`);
            }

            // ── HANDOVER: Initialize DanieWatch command listener IMMEDIATELY ──
            try {
                const danie = require('./src/commands/danie_download');
                if (danie.initUpsertListener) {
                    danie.initUpsertListener(conn);
                    console.log('[DanieWatch] ✅ Listener initialized — commands active IMMEDIATELY!');
                }
            } catch (err) {
                console.error('[DanieWatch] Failed to init listener:', err.message);
            }

            // Upload fresh session to Supabase after successful connection
            try {
                await uploadSessionToSupabase(SESSION_DIR);
                console.log('☁️ Session synced to Supabase after connection open.');
            } catch (_) {}

            // Send startup message (once)
            if (!startupMessageSent) {
                startupMessageSent = true;
                try {
                    const rawId = conn.user?.id || '';
                    if (rawId) {
                        const botJid = jidNormalizedUser(rawId);
                        const startupMsg =
                            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
                            `│     🟢 *DANIEWATCH ONLINE* 🟢     │\n` +
                            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
                            `🟢 *Status:* Online & Operational\n` +
                            `🎬 Send any link directly to download!\n` +
                            `⚡ Type *.alive* for status or *.config* for settings.`;

                        const logoPath = path.join(__dirname, 'assets', 'daniewatch_logo.png');
                        let msgPayload = { text: startupMsg };
                        if (fs.existsSync(logoPath)) {
                            msgPayload = { image: fs.readFileSync(logoPath), caption: startupMsg };
                        }
                        await conn.sendMessage(botJid, msgPayload);
                        console.log('[DanieWatch] ✅ Startup message sent.');
                    }
                } catch (e) {
                    console.error('[DanieWatch] Startup message error:', e.message);
                }
            }

            // Schedule auto-restart if configured
            if (AUTO_RESTART_MINUTES > 0) {
                console.log(`⏱️ Auto-restart timer: Bot will soft-restart in ${AUTO_RESTART_MINUTES} minutes.`);
                setTimeout(async () => {
                    console.log(`⏰ ${AUTO_RESTART_MINUTES} minutes elapsed. Performing soft restart...`);
                    try {
                        // Check if DanieWatch has active tasks
                        const danie = require('./src/commands/danie_download');
                        if (danie.isTaskRunning && danie.isTaskRunning()) {
                            console.log('[DanieWatch] ⏳ Active download in progress. Deferring restart 5 min...');
                            setTimeout(async () => {
                                await gracefulShutdown();
                            }, 5 * 60 * 1000);
                            return;
                        }
                    } catch (_) {}
                    await gracefulShutdown();
                }, AUTO_RESTART_MINUTES * 60 * 1000);
            }
        }

        // ── CONNECTION CLOSE: ANJU-XPRO-V5 status code evaluation ──
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.message || 'Unknown';
            console.log(`⚠️ Connection closed. Status: ${statusCode}, Reason: ${reason}`);

            // 401 = logged out, don't reconnect — session is invalidated
            if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Session logged out. Delete session/ folder and re-pair.');
                console.log('   Run "npm run pair" or "node pair.js" to generate fresh credentials.');
                return;
            }

            // 440 = conflict (another instance connected with same keys)
            if (statusCode === 440) {
                console.log('⚠️ Session conflict (Status 440): Another bot instance is active with these credentials. Backing off 30s before reconnecting...');
                setTimeout(connectToWA, 30000);
                return;
            }

            // 515 = restart required by WhatsApp server
            if (statusCode === 515) {
                console.log('🔄 Restart required by server. Reconnecting...');
            }

            // Reconnect after delay (428 = rate limited = longer delay)
            const delay = statusCode === 428 ? 10000 : 5000;
            console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
            setTimeout(connectToWA, delay);
        }
    });

    // ══════════════════════════════════════════════════════════════════
    //  MESSAGE HANDLING — Auto-read status + react + cache protos
    // ══════════════════════════════════════════════════════════════════
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify' && chatUpdate.type !== 'append') return;
            const msg = chatUpdate.messages ? chatUpdate.messages[0] : null;

            let msgTimestamp = 0;
            if (typeof msg.messageTimestamp === 'number') {
                msgTimestamp = msg.messageTimestamp;
            } else if (typeof msg.messageTimestamp === 'string') {
                msgTimestamp = parseInt(msg.messageTimestamp, 10) || 0;
            } else if (typeof msg.messageTimestamp === 'bigint') {
                msgTimestamp = Number(msg.messageTimestamp);
            } else if (msg.messageTimestamp && typeof msg.messageTimestamp.toNumber === 'function') {
                try { msgTimestamp = msg.messageTimestamp.toNumber(); } catch (_) {}
            } else if (msg.messageTimestamp && typeof msg.messageTimestamp.low === 'number') {
                msgTimestamp = msg.messageTimestamp.low;
            }

            // Connection timestamp gate: silently drop offline backlog messages
            // sent before the bot connected. This eliminates catch-up lag!
            if (_connectTimeSeconds && msgTimestamp > 0 && msgTimestamp < (_connectTimeSeconds - 5)) {
                return; // Discard offline backlog message
            }

            if (!msg.message) {
                if (_connectTime && (Date.now() - _connectTime < 60000)) {
                    return; // Silent discard during grace period
                }
                return;
            }

            if (msg.key?.id && msg.message) {
                msgProtoCache.set(msg.key.id, msg.message);
            }

            const from = msg.key?.remoteJid;
            if (from !== 'status@broadcast') return;

            // Auto-view status
            try {
                await conn.readMessages([msg.key]);
            } catch (_) {}

            // Auto-react with 💚
            try {
                const botJid = jidNormalizedUser(conn.user?.id || '');
                const senderJid = msg.key.participant || msg.key.remoteJid;
                await conn.sendMessage(from, {
                    react: { key: msg.key, text: '💚' }
                }, {
                    statusJidList: [senderJid, botJid]
                });
            } catch (_) {}
        } catch (_) {}
    });

    // ── Auto-reject calls ──
    conn.ev.on('call', async (calls) => {
        for (const call of calls) {
            if (call.status === 'offer') {
                try {
                    await conn.rejectCall(call.id, call.from);
                    console.log(`📞 Auto-rejected call from ${call.from}`);
                } catch (_) {}
            }
        }
    });
}

// ══════════════════════════════════════════════════════════════════════
//  GRACEFUL SHUTDOWN — Clean WebSocket close to prevent 440 conflicts
// ══════════════════════════════════════════════════════════════════════
async function gracefulShutdown() {
    console.log('[Shutdown] 🔌 Disconnecting WhatsApp WebSocket...');
    try {
        if (conn) {
            // conn.end() sends a clean WS close frame
            conn.end(new Error('Graceful shutdown'));
        }
    } catch (_) {}

    // Upload final session state to Supabase before exiting
    try {
        await uploadSessionToSupabase(SESSION_DIR);
        console.log('[Shutdown] ☁️ Final session synced to Supabase.');
    } catch (_) {}

    // Give the WebSocket 3 seconds to fully close
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('[Shutdown] ✅ WebSocket closed. Exiting process...');
    process.exit(0);
}

// Handle SIGTERM from start.js parent process
process.on('SIGTERM', async () => {
    console.log('[Shutdown] Received SIGTERM — shutting down gracefully...');
    await gracefulShutdown();
});

// ── Start ──
console.log('🔥> DanieWatch Bot is starting (ANJU-XPRO-V5 Connection Engine)...');
connectToWA().catch(err => {
    console.error('❌ Fatal connection error:', err);
    process.exit(1);
});
