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
let selectedPairingMode = null; // 'code' or 'qr'
let selectedBotNumber = null;

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}

    if (cleanStart) {
        pairingRetries = 0;
        selectedPairingMode = null;
        selectedBotNumber = null;
        // Always force-nuke on a fresh start to guarantee clean pairing
        await nukeAllSessions();
    }

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });

    const readline = require('readline');

    // ── STEP 1: Select Pairing Method (Code vs QR) ──
    if (!selectedPairingMode) {
        const cliArgs = process.argv.slice(2);
        if (cliArgs.includes('--qr') || cliArgs.includes('-qr') || cliArgs.includes('qr') || cliArgs.includes('2')) {
            selectedPairingMode = 'qr';
        } else if (cliArgs.includes('--code') || cliArgs.includes('-code') || cliArgs.includes('code') || cliArgs.includes('1')) {
            selectedPairingMode = 'code';
        } else if (!process.stdin.isTTY) {
            selectedPairingMode = 'code';
        } else {
            console.log('');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║        📲 SELECT WHATSAPP PAIRING METHOD              ║');
            console.log('╠═══════════════════════════════════════════════════════╣');
            console.log('║                                                       ║');
            console.log('║   [1] 🔑 Pairing Code (Link with Phone Number)         ║');
            console.log('║   [2] 📷 QR Code (Scan with WhatsApp Camera)          ║');
            console.log('║                                                       ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            console.log('');

            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            selectedPairingMode = await new Promise((resolve) => {
                rl.question('👉 Select pairing method (1 or 2) [Default: 1]: ', (ans) => {
                    rl.close();
                    const trimmed = ans.trim();
                    resolve(trimmed === '2' ? 'qr' : 'code');
                });
            });
        }
    }

    // ── STEP 2: If Pairing Code mode, obtain Phone Number ──
    if (selectedPairingMode === 'code' && !selectedBotNumber) {
        let rawNum = process.argv.find(a => /^\+?\d{7,15}$/.test(a.trim())) || process.env.NUMBER || process.env.BOT_NUMBER;
        
        if (!rawNum || rawNum.includes('your account') || rawNum.trim() === '') {
            if (!process.stdin.isTTY) {
                console.error('❌ Error: Phone number missing in non-interactive environment (GitHub Actions). Set BOT_NUMBER secret or pass phone_number input.');
                process.exit(1);
            }
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rawNum = await new Promise((resolve) => {
                rl.question('📱 Enter your WhatsApp phone number with country code (e.g. 923013068663): ', (ans) => {
                    rl.close();
                    resolve(ans);
                });
            });
        }

        if (!rawNum || rawNum.trim() === '') {
            console.log('❌ No valid phone number provided! Exiting.');
            process.exit(1);
        }

        selectedBotNumber = rawNum.replace(/[^0-9]/g, '');
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    console.log(`📡 Baileys version: ${version.join('.')}`);
    if (selectedPairingMode === 'code') {
        console.log(`🤖 Mode: 🔑 Pairing Code (+${selectedBotNumber})`);
    } else {
        console.log('🤖 Mode: 📷 QR Code Scanner');
    }

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
        retryRequestDelayMs: 2000,
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        syncSessionFiles();
    });

    console.log('⏳ Connecting to WhatsApp servers...');

    let pairingCodeRequested = false;
    let pairingCodeTimeout = null;

    if (selectedPairingMode === 'code' && !sock.authState.creds.registered) {
        pairingCodeTimeout = setTimeout(async () => {
            if (pairingCodeRequested) return;
            pairingCodeRequested = true;
            try {
                console.log('⏳ Requesting fresh pairing code from WhatsApp...');
                let code = await sock.requestPairingCode(selectedBotNumber);
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
    } else if (selectedPairingMode === 'qr' && !sock.authState.creds.registered) {
        console.log('📷 Waiting for QR code generation... Scan it with your phone.');
    } else {
        console.log('✅ Session already registered — connecting with existing creds...');
    }

    let lastPrintedQr = null;
    let currentRawQr = null;
    let qrServer = null;
    const QRCode = require('qrcode');
    const http = require('http');

    function startQrWebServer() {
        if (qrServer) return;
        try {
            const PORT = process.env.PORT || 3000;
            qrServer = http.createServer(async (req, res) => {
                if (req.url.startsWith('/qr.png') || req.url === '/qr') {
                    if (currentRawQr) {
                        try {
                            const pngBuffer = await QRCode.toBuffer(currentRawQr, { type: 'png', width: 600, margin: 4 });
                            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
                            return res.end(pngBuffer);
                        } catch (_) {}
                    }
                    const qrPath = path.join(__dirname, 'qr.png');
                    if (fs.existsSync(qrPath)) {
                        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
                        return res.end(fs.readFileSync(qrPath));
                    } else {
                        res.writeHead(404);
                        return res.end('QR Code not generated yet');
                    }
                }

                if (req.url.startsWith('/qr.svg')) {
                    if (currentRawQr) {
                        try {
                            const svgStr = await QRCode.toString(currentRawQr, { type: 'svg', margin: 2, width: 300 });
                            res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
                            return res.end(svgStr);
                        } catch (_) {}
                    }
                }

                let svgContent = '';
                if (currentRawQr) {
                    try {
                        svgContent = await QRCode.toString(currentRawQr, { type: 'svg', margin: 2, width: 300 });
                    } catch (_) {}
                }
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📷 WhatsApp QR Pairing</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            background: #090d16;
            color: #f8fafc;
            font-family: 'Outfit', sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .card {
            background: rgba(30, 41, 59, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 36px 28px;
            text-align: center;
            max-width: 440px;
            width: 100%;
            box-shadow: 0 25px 50px rgba(0,0,0,0.6);
        }
        h1 { margin-top: 0; font-size: 24px; color: #38bdf8; margin-bottom: 8px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
        .qr-container {
            background: #ffffff;
            padding: 20px;
            border-radius: 20px;
            display: inline-block;
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            line-height: 0;
        }
        .qr-container svg, .qr-container img {
            width: 280px;
            height: 280px;
            display: block;
        }
        .steps {
            text-align: left;
            margin-top: 24px;
            font-size: 13px;
            color: #cbd5e1;
            line-height: 1.6;
            background: rgba(0,0,0,0.3);
            padding: 18px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .steps ol { margin: 0; padding-left: 20px; }
        .status {
            margin-top: 20px;
            font-size: 14px;
            color: #10b981;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>📷 WhatsApp QR Pairing</h1>
        <p>Scan this high-resolution QR code with your phone camera in WhatsApp</p>
        <div class="qr-container" id="qrBox">
            ${svgContent ? svgContent : `<img src="/qr.svg?t=${Date.now()}" alt="WhatsApp Vector QR" />`}
        </div>
        <div class="status" id="statusMsg">⏳ Waiting for scan...</div>
        <div class="steps">
            <strong>How to pair:</strong>
            <ol>
                <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                <li>Go to <strong>Settings</strong> &rarr; <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Point your camera directly at the QR code above</li>
            </ol>
        </div>
    </div>
    <script>
        setInterval(async () => {
            try {
                const res = await fetch('/qr.svg?t=' + Date.now());
                if (res.ok) {
                    const svgText = await res.text();
                    if (svgText && svgText.includes('<svg')) {
                        document.getElementById('qrBox').innerHTML = svgText;
                    }
                }
            } catch(e) {}
        }, 3000);
    </script>
</body>
</html>`);
            });
            qrServer.listen(PORT, () => {
                console.log(`\n=======================================================`);
                console.log(`🌐 Scannable Vector Web QR Page running at: http://localhost:${PORT}`);
                console.log(`=======================================================\n`);
            });
        } catch (_) {}
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && selectedPairingMode === 'qr' && qr !== lastPrintedQr) {
            lastPrintedQr = qr;
            currentRawQr = qr;
            try {
                const qrFilePath = path.join(__dirname, 'qr.png');
                await QRCode.toFile(qrFilePath, qr, { width: 600, margin: 4 });
                
                const svgStr = await QRCode.toString(qr, { type: 'svg', margin: 2, width: 400 });
                const svgPath = path.join(__dirname, 'qr.svg');
                fs.writeFileSync(svgPath, svgStr, 'utf-8');

                const htmlContent = `<!DOCTYPE html>
<html>
<head><title>WhatsApp QR Pairing</title></head>
<body style="background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
    <div style="background:#fff;padding:24px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        ${svgStr}
    </div>
</body>
</html>`;
                fs.writeFileSync(path.join(__dirname, 'qr.html'), htmlContent, 'utf-8');

                console.log(`🖼️  Scannable Vector QR saved to: ${svgPath} and ${qrFilePath}`);
                startQrWebServer();

                QRCode.toString(qr, { type: 'terminal', small: true }, (err, miniQr) => {
                    if (!err && miniQr) {
                        console.log('\n=======================================================');
                        console.log('📷 Terminal QR Code (or open http://localhost:3000):');
                        console.log('=======================================================\n');
                        console.log(miniQr);
                        console.log('\n⏳ Waiting for scan...');
                    }
                });
            } catch (err) {
                console.error('Error generating QR code:', err);
            }
        }

        if (connection === 'open') {
            // Clear any pending pairing code timeout
            if (pairingCodeTimeout) clearTimeout(pairingCodeTimeout);
            
            console.log('');
            console.log('=========================================');
            console.log('🎉 SUCCESS! WhatsApp Connected!');
            if (sock.authState && sock.authState.creds) {
                sock.authState.creds.registered = true;
            }
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
