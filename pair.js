const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } = require('anju-xpro-baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

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

function checkAndCleanUnregisteredSession() {
    const credsFile = path.join(SESSION_DIR, 'creds.json');
    if (fs.existsSync(credsFile)) {
        try {
            const rawData = fs.readFileSync(credsFile, 'utf-8');
            const credsData = JSON.parse(rawData);
            if (!credsData.registered) {
                console.log('🧹 Purging old incomplete session for fresh pairing...');
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
                try { fs.rmSync(SESS_ALT_DIR, { recursive: true, force: true }); } catch (_) {}
            }
        } catch (e) {
            console.log('🧹 Purging corrupted session...');
            try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (_) {}
            try { fs.rmSync(SESS_ALT_DIR, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}

    if (cleanStart) {
        checkAndCleanUnregisteredSession();
    }

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });

    let botNumber = process.env.NUMBER || process.env.BOT_NUMBER;
    
    if (!botNumber || botNumber.includes('your account') || botNumber.trim() === '') {
        console.log('❌ NUMBER or BOT_NUMBER is not configured in config.env!');
        console.log('Please set NUMBER or BOT_NUMBER in config.env to your WhatsApp phone number.');
        process.exit(1);
    }

    botNumber = botNumber.replace(/[^0-9]/g, '');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        syncSessionFiles();
    });
    
    console.log(`🤖 Target Phone Number: +${botNumber}`);
    console.log('⏳ Connecting to WhatsApp servers...');

    let pairingCodeRequested = false;

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            if (pairingCodeRequested) return;
            pairingCodeRequested = true;
            try {
                console.log('⏳ Requesting pairing code from WhatsApp...');
                let code = await sock.requestPairingCode(botNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n╔═════════════════════════════════════╗');
                console.log(`║  🔑 YOUR PAIRING CODE: ${code.toUpperCase()}       ║`);
                console.log('╠═════════════════════════════════════╣');
                console.log('║  1. Open WhatsApp on your phone     ║');
                console.log('║  2. Settings → Linked Devices       ║');
                console.log('║  3. Link a Device                   ║');
                console.log('║  4. "Link with phone number"        ║');
                console.log('║  5. Enter the code above            ║');
                console.log('╚═════════════════════════════════════╝\n');
                console.log('⏳ Waiting for authorization...');
            } catch (err) {
                console.error('❌ Failed to get pairing code:', err.message || err);
            }
        }, 1200);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('\n=========================================');
            console.log('🎉 SUCCESS! WhatsApp Connected Successfully!');
            console.log(`🤖 Logged in as: ${sock.user.name || sock.user.id}`);
            console.log('=========================================');
            
            syncSessionFiles();
            await delay(2000);
            process.exit(0);
        }
        
        if (connection === 'close') {
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output) ? lastDisconnect.error.output.statusCode : undefined;
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('❌ Logged out or pairing rejected. Clearing session...');
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
                try { fs.rmSync(SESS_ALT_DIR, { recursive: true, force: true }); } catch (e) {}
                process.exit(1);
            } else if (statusCode === 515 || sock.authState.creds.registered) {
                console.log(`🔄 Handshake complete (Code: ${statusCode}). Finalizing login...`);
                await delay(2000);
                startPairing(false);
            } else {
                console.log(`🔄 Connection reset by WhatsApp (Code: ${statusCode || 'closed'}).`);
            }
        }
    });
}

startPairing(true).catch(err => {
    console.error('Error starting pairing:', err);
});
