const fs = require('fs');
const path = require('path');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason
} = require('anju-xpro-baileys');

const os = require('os');
const { uploadSessionToSupabase, clearSupabaseSession } = require('./supabaseSession');
const { killPreviousInstances } = require('./singleInstance');

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const SESSION_DIR = isServerless ? path.join(os.tmpdir(), 'session') : path.join(__dirname, '../../session');
const SESS_ALT_DIR = isServerless ? path.join(os.tmpdir(), 'sess') : path.join(__dirname, '../../sess');

let activePairingSock = null;
let currentPairingCode = null;
let pairingStatus = 'idle'; // 'idle', 'generating', 'waiting_for_code', 'connected', 'error'
let pairingErrorMessage = '';
let activeUser = null;

/**
 * Aggressively purges local session files & remote Supabase session table.
 */
async function nukeAllSessionState() {
    console.log('🧹 [WebPairing] Nuking all session data (local + Supabase) for fresh pairing...');
    for (const dir of [SESSION_DIR, SESS_ALT_DIR]) {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        } catch (_) {}
    }
    try {
        await clearSupabaseSession();
    } catch (_) {}
}

/**
 * Returns current pairing state & connection info.
 */
function getPairingState(getBotConnFn) {
    const mainConn = typeof getBotConnFn === 'function' ? getBotConnFn() : null;
    const isConnected = !!(mainConn && mainConn.user) || (activePairingSock && activePairingSock.user);
    const user = (mainConn && mainConn.user) || (activePairingSock && activePairingSock.user) || activeUser;
    
    let fileCount = 0;
    try {
        if (fs.existsSync(SESSION_DIR)) {
            fileCount = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json')).length;
        }
    } catch (_) {}

    return {
        connected: !!isConnected,
        pairingStatus,
        pairingCode: currentPairingCode,
        errorMessage: pairingErrorMessage,
        user: user ? {
            id: user.id || 'Unknown',
            name: user.name || 'Bot User',
            jid: user.id ? user.id.split(':')[0] + '@s.whatsapp.net' : ''
        } : null,
        fileCount
    };
}

/**
 * Initiates fresh pairing session for a phone number.
 */
async function requestFreshPairingCode(phoneNumber, onConnectedCallback, getBotConnFn) {
    if (!phoneNumber) {
        throw new Error('Phone number is required!');
    }

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 8) {
        throw new Error('Invalid phone number format. Provide international number (e.g. 923013068663).');
    }

    // 1. Reset state & disconnect existing sockets
    pairingStatus = 'generating';
    currentPairingCode = null;
    pairingErrorMessage = '';

    const currentConn = typeof getBotConnFn === 'function' ? getBotConnFn() : null;
    if (currentConn && typeof currentConn.end === 'function') {
        try { currentConn.end(new Error('Re-pairing requested via Web UI')); } catch (_) {}
    }
    if (activePairingSock && typeof activePairingSock.end === 'function') {
        try { activePairingSock.end(new Error('New pairing session started')); } catch (_) {}
    }

    // 2. Nuke local session files & remote Supabase session table
    await nukeAllSessionState();

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });

    // 3. Initialize fresh Baileys auth state
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
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        downloadHistory: false
    });

    activePairingSock = sock;

    sock.ev.on('creds.update', saveCreds);

    // 4. Request pairing code after WebSocket handshake
    await new Promise(resolve => setTimeout(resolve, 4000));

    try {
        let code = await sock.requestPairingCode(cleanNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        currentPairingCode = code ? code.toUpperCase() : null;
        pairingStatus = 'waiting_for_code';
        console.log(`🔑 [WebPairing] Fresh pairing code generated for +${cleanNumber}: ${currentPairingCode}`);
    } catch (err) {
        pairingStatus = 'error';
        pairingErrorMessage = err.message || 'Failed to request pairing code from WhatsApp.';
        console.error('❌ [WebPairing] Error requesting pairing code:', err.message);
        throw err;
    }

    // 5. Connection lifecycle listener
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('🎉 [WebPairing] WhatsApp Connected via Fresh Web Pairing!');
            pairingStatus = 'connected';
            currentPairingCode = null;
            activeUser = sock.user;

            await saveCreds();

            // Sync to alternate sess dir
            try {
                const files = fs.readdirSync(SESSION_DIR);
                for (const f of files) {
                    fs.copyFileSync(path.join(SESSION_DIR, f), path.join(SESS_ALT_DIR, f));
                }
            } catch (_) {}

            console.log('☁️ [WebPairing] Uploading clean fresh session to Supabase...');
            try {
                await uploadSessionToSupabase(SESSION_DIR);
                console.log('✅ [WebPairing] Fresh session saved to Supabase successfully.');
            } catch (uErr) {
                console.warn('⚠️ [WebPairing] Supabase upload error:', uErr.message);
            }

            if (typeof onConnectedCallback === 'function') {
                onConnectedCallback(sock);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                pairingStatus = 'error';
                pairingErrorMessage = 'Pairing rejected or logged out. Please try again.';
                await nukeAllSessionState();
            }
        }
    });

    return currentPairingCode;
}

/**
 * Generates the HTML Pairing Dashboard UI.
 */
function renderPairingPage(defaultNumber = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>✨ DanieWatch Bot — Web Pairing Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Fira+Code:wght@500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0b0f19 0%, #111827 50%, #0d1322 100%);
            --card-bg: rgba(17, 24, 39, 0.75);
            --card-border: rgba(255, 255, 255, 0.08);
            --accent-cyan: #00f2fe;
            --accent-purple: #7928ca;
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
            max-width: 520px;
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 36px 28px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 242, 254, 0.1);
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
            background: var(--accent-green);
            box-shadow: 0 0 10px var(--accent-green);
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
            background: rgba(0, 0, 0, 0.3);
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
                <span id="statusText">Checking status...</span>
            </div>
            <h1>DanieWatch Web Pairing</h1>
            <p class="subtitle">Get a fresh pairing code to connect your WhatsApp bot & save clean keys to Supabase.</p>
        </div>

        <form id="pairForm" onsubmit="handleGenerate(event)">
            <div class="form-group">
                <label for="phoneNumber">WhatsApp Phone Number</label>
                <input type="text" id="phoneNumber" placeholder="e.g. 923013068663" value="${defaultNumber}" required>
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

        async function checkStatus() {
            try {
                const res = await fetch('/api/pair-status');
                const data = await res.json();
                const dot = document.getElementById('statusDot');
                const txt = document.getElementById('statusText');

                if (data.connected) {
                    dot.style.background = '#10b981';
                    txt.textContent = 'ONLINE (' + (data.user ? data.user.name || data.user.jid : 'Connected') + ')';
                } else {
                    dot.style.background = '#f59e0b';
                    txt.textContent = 'UNPAIRED / OFFLINE';
                }
            } catch (e) {}
        }

        async function handleGenerate(e) {
            e.preventDefault();
            const phone = document.getElementById('phoneNumber').value.trim();
            if (!phone) return;

            const btn = document.getElementById('btnSubmit');
            const msg = document.getElementById('statusMsg');
            const card = document.getElementById('codeCard');

            btn.disabled = true;
            msg.innerHTML = '<span class="spinner"></span> Purging old session & requesting fresh pairing code...';
            card.style.display = 'none';

            try {
                const res = await fetch('/api/generate-pair-code?number=' + encodeURIComponent(phone), { method: 'POST' });
                const data = await res.json();

                if (data.success && data.pairingCode) {
                    document.getElementById('codeDisplay').textContent = data.pairingCode;
                    card.style.display = 'block';
                    msg.style.color = '#00f2fe';
                    msg.innerHTML = '⏳ Waiting for you to enter the code in WhatsApp...';

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
                        clearInterval(pollInterval);
                        document.getElementById('statusMsg').style.color = '#10b981';
                        document.getElementById('statusMsg').textContent = '🎉 Connected successfully! Fresh session uploaded to Supabase.';
                        document.getElementById('btnSubmit').disabled = false;
                        checkStatus();
                    }
                } catch (e) {}
            }, 3000);
        }

        // Auto-trigger if URL has ?phone= or ?number=
        window.addEventListener('DOMContentLoaded', () => {
            checkStatus();
            const params = new URLSearchParams(window.location.search);
            const num = params.get('phone') || params.get('number');
            if (num) {
                document.getElementById('phoneNumber').value = num;
                document.getElementById('pairForm').requestSubmit();
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Registers Express routes for Web Pairing on app.
 */
function registerWebPairingRoutes(app, getBotConnFn, onConnectedCallback) {
    // 1. Dashboard UI
    app.get(['/pair', '/pairing'], (req, res) => {
        const defaultNum = req.query.phone || req.query.number || process.env.NUMBER || process.env.BOT_NUMBER || '';
        res.setHeader('Content-Type', 'text/html');
        res.send(renderPairingPage(defaultNum));
    });

    // 2. Status API
    app.get('/api/pair-status', (req, res) => {
        res.json(getPairingState(getBotConnFn));
    });

    // 3. Generate Code API
    const handleGenerateRequest = async (req, res) => {
        const num = req.query.number || req.query.phone || req.body?.number || req.body?.phone || process.env.NUMBER || process.env.BOT_NUMBER;
        if (!num) {
            return res.status(400).json({ success: false, error: 'Phone number is required.' });
        }
        try {
            const code = await requestFreshPairingCode(num, onConnectedCallback, getBotConnFn);
            res.json({ success: true, pairingCode: code, number: num });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message || 'Error generating pairing code' });
        }
    };

    app.post('/api/generate-pair-code', handleGenerateRequest);
    app.get('/api/generate-pair-code', handleGenerateRequest);

    // 4. Nuke Session API
    app.post('/api/clear-session', async (req, res) => {
        try {
            await nukeAllSessionState();
            res.json({ success: true, message: 'All local & remote session data cleared.' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

module.exports = {
    requestFreshPairingCode,
    getPairingState,
    nukeAllSessionState,
    registerWebPairingRoutes,
    renderPairingPage
};
