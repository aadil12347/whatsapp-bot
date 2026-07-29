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

let isPairingInProgress = false;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function syncSessionFiles() {
    try {
        if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
        
        // Copy contents between session and sess to keep both in sync
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

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}

    if (cleanStart) {
        if (fs.existsSync(SESSION_DIR)) try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
        if (fs.existsSync(SESS_ALT_DIR)) try { fs.rmSync(SESS_ALT_DIR, { recursive: true, force: true }); } catch (e) {}
    }
    
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (!fs.existsSync(SESS_ALT_DIR)) fs.mkdirSync(SESS_ALT_DIR, { recursive: true });

    let botNumber = process.env.BOT_NUMBER;
    
    if (!botNumber || botNumber.includes('your account') || botNumber.trim() === '') {
        console.log('❌ BOT_NUMBER is not configured in config.env!');
        console.log('Please set BOT_NUMBER in config.env to your WhatsApp phone number.');
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
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
    });
    
    sock.ev.on('creds.update', async () => {
        await saveCreds();
        syncSessionFiles();
    });
    
    console.log(`🤖 Target Phone Number: +${botNumber}`);
    console.log('⏳ Connecting to WhatsApp servers...');

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
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔄 Connection closed. Code: ${statusCode || '?'}`);
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('❌ Logged out or pairing rejected. Clearing session...');
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
                try { fs.rmSync(SESS_ALT_DIR, { recursive: true, force: true }); } catch (e) {}
                process.exit(1);
            }
            
            console.log('🔄 Reconnecting...');
            await delay(3000);
            startPairing(false);
        }
    });

    // Request pairing code ONCE when not registered
    if (!sock.authState.creds.registered && !isPairingInProgress) {
        isPairingInProgress = true;
        await delay(3000);
        console.log('⏳ Requesting pairing code from WhatsApp...');
        try {
            const code = await sock.requestPairingCode(botNumber);
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
            console.error('❌ Failed to get pairing code:', err.message);
            isPairingInProgress = false;
        }
    }
}

startPairing(true).catch(err => {
    console.error('Error starting pairing:', err);
});
