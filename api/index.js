const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pino = require('pino');
const { createClient } = require('@supabase/supabase-js');
async function getBaileysLib() {
    const packages = ['anju-xpro-baileys', '@whiskeysockets/baileys', 'daniewatch-baileys'];
    for (const pkg of packages) {
        try {
            let b;
            try {
                b = require(pkg);
            } catch (err) {
                if (err.code === 'ERR_REQUIRE_ESM' || (err.message && err.message.includes('ES Module'))) {
                    b = await import(pkg);
                }
            }
            if (!b) continue;

            const useMulti = b.useMultiFileAuthState || (b.default && b.default.useMultiFileAuthState);
            if (typeof useMulti === 'function') {
                return {
                    makeWASocket: (b.default && typeof b.default === 'function') ? b.default : (b.makeWASocket || b),
                    useMultiFileAuthState: useMulti,
                    makeCacheableSignalKeyStore: b.makeCacheableSignalKeyStore || (b.default && b.default.makeCacheableSignalKeyStore),
                    fetchLatestBaileysVersion: b.fetchLatestBaileysVersion || (b.default && b.default.fetchLatestBaileysVersion),
                    Browsers: b.Browsers || (b.default && b.default.Browsers),
                    DisconnectReason: b.DisconnectReason || (b.default && b.default.DisconnectReason)
                };
            }
        } catch (_) {}
    }

    try {
        const b = await import('@whiskeysockets/baileys');
        return {
            makeWASocket: b.default || b.makeWASocket || b,
            useMultiFileAuthState: b.useMultiFileAuthState || (b.default && b.default.useMultiFileAuthState),
            makeCacheableSignalKeyStore: b.makeCacheableSignalKeyStore || (b.default && b.default.makeCacheableSignalKeyStore),
            fetchLatestBaileysVersion: b.fetchLatestBaileysVersion || (b.default && b.default.fetchLatestBaileysVersion),
            Browsers: b.Browsers || (b.default && b.default.Browsers),
            DisconnectReason: b.DisconnectReason || (b.default && b.default.DisconnectReason)
        };
    } catch (_) {
        const b = require('anju-xpro-baileys');
        return {
            makeWASocket: b.default || b,
            useMultiFileAuthState: b.useMultiFileAuthState,
            makeCacheableSignalKeyStore: b.makeCacheableSignalKeyStore,
            fetchLatestBaileysVersion: b.fetchLatestBaileysVersion,
            Browsers: b.Browsers,
            DisconnectReason: b.DisconnectReason
        };
    }
}

// Load environment variables if config.env exists
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) {
    try { require('dotenv').config({ path: envPath }); } catch (_) {}
}

const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;

function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) return null;
    try {
        return createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (_) {
        return null;
    }
}

// Session directory in /tmp for Vercel Serverless Function
const SESSION_DIR = path.join(os.tmpdir(), 'daniewatch_session');

let activeSock = null;
let currentPairingCode = null;
let pairingStatus = 'idle'; // 'idle', 'generating', 'waiting_for_code', 'connected', 'error'
let pairingError = '';
let activeUser = null;

/**
 * Purges local /tmp session & remote Supabase bot_session table.
 */
async function nukeSessions() {
    try {
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
    } catch (_) {}

    const supabase = getSupabase();
    if (supabase) {
        try {
            await supabase.from('bot_session').delete().neq('id', 0);
            console.log('🧹 Remote Supabase bot_session cleared.');
        } catch (_) {}
    }
}

/**
 * Uploads clean session files to Supabase.
 */
async function uploadToSupabase() {
    const supabase = getSupabase();
    if (!supabase || !fs.existsSync(SESSION_DIR)) return false;

    const files = fs.readdirSync(SESSION_DIR);
    if (!files.includes('creds.json')) return false;

    const sessionData = {};
    for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const fp = path.join(SESSION_DIR, f);
        try {
            const content = fs.readFileSync(fp, 'utf-8');
            const stat = fs.statSync(fp);
            sessionData[f] = { content, mtime: stat.mtimeMs };
        } catch (_) {}
    }

    if (!sessionData['creds.json']) return false;

    try {
        console.log('🧹 Purging all old session records from Supabase database...');
        const { error: delErr } = await supabase.from('bot_session').delete().neq('id', 0);
        if (delErr) {
            console.warn('⚠️ Warning while purging old session:', delErr.message);
        } else {
            console.log('✅ Old session records successfully purged from Supabase.');
        }

        console.log('☁️ Uploading brand new session keys (creds.json) to Supabase...');
        const { error } = await supabase.from('bot_session').upsert({
            id: 1,
            session_data: sessionData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

        if (error) {
            console.error('❌ Supabase upload error:', error.message);
            return false;
        } else {
            console.log(`✅ Uploaded new session keys (${Object.keys(sessionData).length} essential file(s)) to Supabase successfully!`);
            return true;
        }
    } catch (e) {
        console.error('❌ Supabase exception during session sync:', e.message);
        return false;
    }
}

/**
 * Requests fresh WhatsApp pairing code.
 */
async function generatePairingCode(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 8) {
        throw new Error('Please enter a valid international phone number (e.g. 923013068663).');
    }

    pairingStatus = 'generating';
    currentPairingCode = null;
    pairingError = '';

    if (activeSock && typeof activeSock.end === 'function') {
        try { activeSock.end(new Error('New pairing requested')); } catch (_) {}
    }

    await nukeSessions();
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const baileysLib = await getBaileysLib();
    if (!baileysLib || typeof baileysLib.useMultiFileAuthState !== 'function') {
        throw new Error('Baileys auth state handler (useMultiFileAuthState) could not be loaded.');
    }

    const {
        makeWASocket,
        useMultiFileAuthState,
        makeCacheableSignalKeyStore,
        fetchLatestBaileysVersion,
        Browsers,
        DisconnectReason
    } = baileysLib;

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: false,
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    activeSock = sock;
    sock.ev.on('creds.update', saveCreds);

    await new Promise(r => setTimeout(r, 4000));

    try {
        let code = await sock.requestPairingCode(cleanNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        currentPairingCode = code ? code.toUpperCase() : null;
        pairingStatus = 'waiting_for_code';
    } catch (err) {
        pairingStatus = 'error';
        pairingError = err.message || 'Failed to request pairing code.';
        throw err;
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            pairingStatus = 'connected';
            currentPairingCode = null;
            activeUser = sock.user;
            await saveCreds();
            const uploadOk = await uploadToSupabase();
            
            // Send confirmation WhatsApp message directly to paired account
            try {
                const userJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                await sock.sendMessage(userJid, {
                    text: `*✨ DANIEWATCH BOT SESSION PAIRED!*\n\n` +
                          `✅ Your WhatsApp session keys have been successfully paired and uploaded to your Supabase database!\n\n` +
                          `🚀 Your DanieWatch Bot (on GitHub Actions, Koyeb, Render, Railway, or local) will now download this session and come ONLINE automatically without any extra configuration.\n\n` +
                          `Status: ${uploadOk ? 'Synced to Supabase ✅' : 'Local Only ⚠️'}`
                });
                console.log(`📱 Sent pairing confirmation WhatsApp message to ${userJid}`);
            } catch (msgErr) {
                console.warn('⚠️ Could not send confirmation message:', msgErr.message);
            }
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut || code === 401) {
                pairingStatus = 'error';
                pairingError = 'Pairing rejected or logged out. Please try again.';
                await nukeSessions();
            }
        }
    });

    return currentPairingCode;
}

/**
 * Renders the HTML Web Pairing Dashboard.
 */
function renderHTML(defaultNum = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>✨ DanieWatch Bot — WhatsApp Web Pairing</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Fira+Code:wght@600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0b0f19 0%, #111827 50%, #0d1322 100%);
            --card-bg: rgba(17, 24, 39, 0.8);
            --card-border: rgba(255, 255, 255, 0.08);
            --accent-cyan: #00f2fe;
            --accent-green: #10b981;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }

        body {
            background: var(--bg-gradient);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            width: 100%;
            max-width: 480px;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 36px 28px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 242, 254, 0.1);
        }

        .header {
            text-align: center;
            margin-bottom: 28px;
        }

        .badge-box {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(0, 242, 254, 0.1);
            border: 1px solid rgba(0, 242, 254, 0.2);
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            color: var(--accent-cyan);
            margin-bottom: 14px;
        }

        .badge-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #f59e0b;
        }

        h1 {
            font-size: 26px;
            font-weight: 700;
            background: linear-gradient(90deg, #00f2fe, #4facfe, #00f2fe);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }

        p.subtitle {
            font-size: 14px;
            color: var(--text-secondary);
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        input[type="text"] {
            width: 100%;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            padding: 14px 18px;
            font-size: 16px;
            color: #fff;
            outline: none;
            transition: all 0.3s ease;
        }

        input[type="text"]:focus {
            border-color: var(--accent-cyan);
            box-shadow: 0 0 15px rgba(0, 242, 254, 0.25);
        }

        .btn-submit {
            width: 100%;
            background: linear-gradient(135deg, var(--accent-cyan) 0%, #0072ff 100%);
            border: none;
            border-radius: 14px;
            padding: 16px;
            font-size: 16px;
            font-weight: 700;
            color: #000;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            box-shadow: 0 8px 25px rgba(0, 242, 254, 0.3);
        }

        .btn-submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 30px rgba(0, 242, 254, 0.4);
        }

        .btn-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .code-card {
            display: none;
            margin-top: 28px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px dashed rgba(0, 242, 254, 0.4);
            border-radius: 18px;
            padding: 24px;
            text-align: center;
        }

        .code-title {
            font-size: 13px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }

        .code-display {
            font-family: 'Fira Code', monospace;
            font-size: 32px;
            font-weight: 700;
            color: var(--accent-cyan);
            letter-spacing: 4px;
            margin-bottom: 16px;
            text-shadow: 0 0 20px rgba(0, 242, 254, 0.5);
        }

        .btn-copy {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 10px 24px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-copy:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .steps-box {
            margin-top: 20px;
            text-align: left;
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.6;
        }

        .steps-box ol {
            padding-left: 20px;
        }

        .status-msg {
            margin-top: 16px;
            font-size: 14px;
            text-align: center;
            min-height: 20px;
        }

        .spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid rgba(0, 242, 254, 0.3);
            border-top-color: var(--accent-cyan);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="badge-box">
                <span class="badge-dot" id="statusDot"></span>
                <span id="statusText">Ready</span>
            </div>
            <h1>DanieWatch Web Pairing</h1>
            <p class="subtitle">Enter your phone number to get a fresh WhatsApp pairing code and save keys to Supabase.</p>
        </div>

        <form id="pairForm" onsubmit="handleGenerate(event)">
            <div class="form-group">
                <label for="phoneNumber">WhatsApp Phone Number</label>
                <input type="text" id="phoneNumber" placeholder="e.g. 923013068663" value="${defaultNum}" required>
            </div>
            <button type="submit" class="btn-submit" id="btnSubmit">
                🚀 Request Fresh Pairing Code
            </button>
        </form>

        <div class="status-msg" id="statusMsg"></div>

        <div class="code-card" id="codeCard">
            <div class="code-title">🔑 Your Pairing Code</div>
            <div class="code-display" id="codeDisplay">---- ----</div>
            <button class="btn-copy" onclick="copyCode()">📋 Copy Pairing Code</button>
            <div class="steps-box">
                <strong>How to pair:</strong>
                <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Go to <strong>Settings</strong> &rarr; <strong>Linked Devices</strong></li>
                    <li>Tap <strong>Link a Device</strong> &rarr; <strong>Link with phone number instead</strong></li>
                    <li>Enter the pairing code shown above!</li>
                </ol>
            </div>
        </div>
    </div>

    <script>
        let pollInterval = null;
        let countdownTimer = null;
        let timeLeft = 60;

        async function handleGenerate(e) {
            e.preventDefault();
            const phone = document.getElementById('phoneNumber').value.trim();
            if (!phone) return;

            const btn = document.getElementById('btnSubmit');
            const msg = document.getElementById('statusMsg');
            const card = document.getElementById('codeCard');

            btn.disabled = true;
            msg.style.color = '#00f2fe';
            msg.innerHTML = '<span class="spinner"></span> Requesting fresh pairing code from WhatsApp...';
            card.style.display = 'none';

            if (countdownTimer) clearInterval(countdownTimer);
            if (pollInterval) clearInterval(pollInterval);

            try {
                const res = await fetch('/api/generate-pair-code?number=' + encodeURIComponent(phone), { method: 'POST' });
                const data = await res.json();

                if (data.success && data.pairingCode) {
                    document.getElementById('codeDisplay').textContent = data.pairingCode;
                    card.style.display = 'block';
                    
                    // Start 60-Second Live Countdown
                    timeLeft = 60;
                    msg.style.color = '#00f2fe';
                    msg.innerHTML = '⏳ Enter code on your phone! <strong>Expires in ' + timeLeft + 's</strong>';

                    countdownTimer = setInterval(() => {
                        timeLeft--;
                        if (timeLeft > 0) {
                            msg.innerHTML = '⏳ Enter code on your phone! <strong>Expires in ' + timeLeft + 's</strong>';
                        } else {
                            clearInterval(countdownTimer);
                            if (pollInterval) clearInterval(pollInterval);
                            msg.style.color = '#ef4444';
                            msg.innerHTML = '⚠️ Pairing code expired (60s reached). Click button below to get a fresh code.';
                            btn.disabled = false;
                        }
                    }, 1000);

                    startPolling();
                } else {
                    msg.style.color = '#ef4444';
                    msg.textContent = '❌ Error: ' + (data.error || 'Failed to generate code.');
                    btn.disabled = false;
                }
            } catch (err) {
                msg.style.color = '#ef4444';
                msg.textContent = '❌ Request failed: ' + err.message;
                btn.disabled = false;
            }
        }

        function copyCode() {
            const code = document.getElementById('codeDisplay').textContent.replace(/-/g, '');
            navigator.clipboard.writeText(code);
            alert('Copied pairing code to clipboard: ' + code);
        }

        function startPolling() {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch('/api/pair-status');
                    const data = await res.json();
                    if (data.connected) {
                        if (pollInterval) clearInterval(pollInterval);
                        if (countdownTimer) clearInterval(countdownTimer);
                        document.getElementById('statusMsg').style.color = '#10b981';
                        document.getElementById('statusMsg').innerHTML = '🎉 <strong>Connected successfully!</strong> Fresh session uploaded to Supabase.';
                        document.getElementById('statusDot').style.background = '#10b981';
                        document.getElementById('statusText').textContent = 'CONNECTED';
                        document.getElementById('btnSubmit').disabled = false;
                    }
                } catch (e) {}
            }, 2000);
        }
    </script>
</body>
</html>`;
}

// ── Express App Setup ──
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTML Web Pairing UI
app.get(['/', '/pair', '/pairing'], (req, res) => {
    const defaultNum = req.query.phone || req.query.number || process.env.NUMBER || process.env.BOT_NUMBER || '';
    res.setHeader('Content-Type', 'text/html');
    res.send(renderHTML(defaultNum));
});

// Status API
app.get('/api/pair-status', (req, res) => {
    const isConnected = pairingStatus === 'connected' || !!(activeSock && activeSock.user);
    res.json({
        connected: isConnected,
        status: pairingStatus,
        pairingCode: currentPairingCode,
        error: pairingError,
        user: activeUser ? { name: activeUser.name, jid: activeUser.id } : null
    });
});

// Generate Code API
const handleGenerate = async (req, res) => {
    const num = req.query.number || req.query.phone || req.body?.number || req.body?.phone || process.env.NUMBER || process.env.BOT_NUMBER;
    if (!num) {
        return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }
    try {
        const code = await generatePairingCode(num);
        res.json({ success: true, pairingCode: code, number: num });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed to generate code.' });
    }
};

app.post('/api/generate-pair-code', handleGenerate);
app.get('/api/generate-pair-code', handleGenerate);

// Fallback to render HTML
app.use((req, res) => {
    const defaultNum = req.query.phone || req.query.number || process.env.NUMBER || process.env.BOT_NUMBER || '';
    res.setHeader('Content-Type', 'text/html');
    res.send(renderHTML(defaultNum));
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`✨ DanieWatch Web Session Generator Server Running!`);
        console.log(`🌐 Open in browser: http://localhost:${PORT}`);
        console.log(`==================================================\n`);
    });
}

module.exports = app;
