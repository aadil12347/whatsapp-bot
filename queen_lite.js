// ═══════════════════════════════════════════════════════════════════════
//  queen_lite.js — DanieWatch Bot Lightweight Core
//  Replaces the 140KB obfuscated queen.js with clean, readable code.
//  Only does what's actually needed: Baileys connection + your commands.
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
const express = require('express');
const NodeCache = require('node-cache');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    Browsers,
    proto,
    getContentType
} = require('anju-xpro-baileys');

// Load config
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const sess = require('./session');
const port = process.env.PORT || sess.PORT || 3000;
const SESSION_DIR = path.join(__dirname, 'session');

// ── Express Health Server ──
const app = express();
app.get('/', (req, res) => res.send('© DanieWatch Downloader Bot 💚 Running'));
app.listen(port, () => console.log(`© DanieWatch Downloader Bot 💚 Server listening on port http://localhost:${port}`));

// ── Logger (silent) ──
const logger = pino({ level: 'silent' });

// ── Message retry cache ──
const msgRetryCounterCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// ── Proto message cache for retry decryption ──
// When Baileys fails to decrypt and retries, it calls getMessage() to get the original proto.
// We cache message protos here so retries can succeed.
const msgProtoCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ── State ──
let conn = null;
let startupMessageSent = false;

// ── Auto-restart timer ──
const AUTO_RESTART_MINUTES = parseInt(process.env.MAX_RUN_TIME_MINUTES || '0', 10);

// ── Main Connection Function ──
async function connectToWA() {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

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
        emitOwnEvents: true,
        generateHighQualityLinkPreview: false,
        // Allow Baileys to request message re-send from WhatsApp when decryption fails.
        // This is the proper Signal Protocol mechanism — when the ratchet is out of sync,
        // Baileys will send a retry receipt and the sender re-encrypts with a fresh session.
        retryRequestDelayMs: 2000,
        // Provide the message proto for retry decryption attempts
        getMessage: async (key) => {
            const cached = msgProtoCache.get(key.id);
            if (cached) return cached;
            return { conversation: null };
        }
    });

    // ── Save credentials on update ──
    conn.ev.on('creds.update', saveCreds);

    // ── Connection lifecycle ──
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('🔥 DanieWatch Bot connected ✅');

            // Log bot identity for debugging owner/LID matching
            if (conn.user) {
                console.log(`[DanieWatch] 🆔 Bot identity: id=${conn.user.id || 'N/A'}, lid=${conn.user.lid || 'N/A'}, name=${conn.user.name || 'N/A'}`);
            }

            // Force presence update to establish fresh Signal sessions with WA servers
            try {
                await conn.sendPresenceUpdate('available');
            } catch (_) {}

            // Wait for the initial flood of stale/undecryptable queued messages to flush.
            // Messages queued while the bot was offline are encrypted with old ratchet keys
            // and will arrive as undefined payload. We need to let them drain before
            // initializing the command listener, otherwise the listener's undecryptable
            // message counter gets overwhelmed and new messages may get lost in the noise.
            console.log('[DanieWatch] ⏳ Waiting 10s for stale queued messages to flush...');
            await new Promise(r => setTimeout(r, 10000));

            // Initialize DanieWatch command listener AFTER the flush
            try {
                const danie = require('./src/commands/danie_download');
                if (danie.initUpsertListener) {
                    danie.initUpsertListener(conn);
                    console.log('[DanieWatch] ✅ Listener initialized — commands active NOW!');
                }
            } catch (err) {
                console.error('[DanieWatch] Failed to init listener:', err.message);
            }

            // Send startup message (once)
            if (!startupMessageSent) {
                startupMessageSent = true;
                try {
                    const rawId = conn.user?.id || '';
                    if (rawId) {
                        const botJid = jidNormalizedUser(rawId);
                        const startupMsg =
                            `╭─── ⋆ ⋅ ✦ ⋅ ⋆ ───╮\n` +
                            `   ✨ *DANIEWATCH BOT* ✨\n` +
                            `╰─── ⋆ ⋅ ✦ ⋅ ⋆ ───╯\n\n` +
                            `⚡ *Bot Status*: \`Online & Ready\`\n\n` +
                            `┌─❒ *Quick Start*\n` +
                            `│ 🔹 Send any movie/video link directly to download!\n` +
                            `│ 🔹 Type *.alive* for full control menu\n` +
                            `│ 🔹 Type *.config* to change options\n` +
                            `└───────────────\n\n` +
                            `🚀 _Your bot is fully active and listening for commands!_`;

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
                            setTimeout(() => process.exit(0), 5 * 60 * 1000);
                            return;
                        }
                    } catch (_) {}
                    process.exit(0); // start.js will handle session upload and restart
                }, AUTO_RESTART_MINUTES * 60 * 1000);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.message || 'Unknown';
            console.log(`⚠️ Connection closed. Status: ${statusCode}, Reason: ${reason}`);

            // 401 = logged out, don't reconnect
            if (statusCode === 401) {
                console.log('❌ Session logged out. Delete session/ folder and re-pair.');
                return;
            }

            // 515 = restart required
            if (statusCode === 515) {
                console.log('🔄 Restart required by server. Reconnecting...');
            }

            // Reconnect after delay
            const delay = statusCode === 428 ? 10000 : 5000; // rate-limited = longer delay
            console.log(`🔄 Reconnecting in ${delay / 1000}s...`);
            setTimeout(connectToWA, delay);
        }
    });

    // ── Auto-read status updates + react + cache message protos for retry ──
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify') return;
            const msg = chatUpdate.messages[0];
            if (!msg || !msg.message) return;

            // Cache message proto for retry decryption support
            if (msg.key?.id && msg.message) {
                msgProtoCache.set(msg.key.id, msg.message);
            }

            const from = msg.key.remoteJid;
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

// ── Start ──
console.log('🔥> DanieWatch Bot is starting...');
connectToWA().catch(err => {
    console.error('❌ Fatal connection error:', err);
    process.exit(1);
});
