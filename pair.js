const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('anju-xpro-baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

// Use the SAME session directory as queen.js ('sess/')
const SESSION_DIR = path.join(__dirname, 'sess');

let pairingCodeRequested = false;
let retryCount = 0;
const MAX_RETRIES = 5;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}

    // Check if we already have a valid registered session
    const credsPath = path.join(SESSION_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            if (creds.registered === true && creds.me && creds.me.id) {
                console.log('\n=========================================');
                console.log('✅ Session already exists and is registered!');
                console.log(`🤖 Linked to: ${creds.me.id}`);
                console.log('=========================================');
                console.log('You can start your bot directly with:');
                console.log('  pnpm start  or  node start.js');
                console.log('=========================================');
                console.log('\n⚠️  If you want to pair a NEW device, first:');
                console.log('  1. Open WhatsApp → Settings → Linked Devices');
                console.log('  2. Remove the old linked device');
                console.log('  3. Delete the sess/ folder');
                console.log('  4. Run "node pair.js" again\n');
                process.exit(0);
            }
        } catch (e) {
            console.log('⚠️  Found corrupted creds.json, will clean and re-pair...');
        }
    }

    if (cleanStart && fs.existsSync(SESSION_DIR)) {
        try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        } catch (e) {}
    }
    
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    let botNumber = process.env.BOT_NUMBER;
    
    if (!botNumber || botNumber.includes('your account') || botNumber.trim() === '') {
        console.log('❌ BOT_NUMBER is not configured!');
        console.log('Please edit "config.env" and add your number:');
        console.log('BOT_NUMBER=923013068663');
        process.exit(1);
    }

    botNumber = botNumber.replace(/[^0-9]/g, '');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        browser: ['Chrome (Linux)', '', ''],
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 500,
        markOnlineOnConnect: false,
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    console.log(`🤖 Target Phone Number: +${botNumber}`);
    console.log('⏳ Connecting to WhatsApp servers...');

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // When QR is generated, it means the socket is ready — request pairing code instead
        if (qr && !pairingCodeRequested) {
            pairingCodeRequested = true;
            
            // Small delay to let the connection stabilize after QR is ready
            await delay(2000);
            
            console.log('⏳ Requesting pairing code from WhatsApp...');
            try {
                const code = await sock.requestPairingCode(botNumber);
                console.log('\n=========================================');
                console.log(`🔑 YOUR PAIRING CODE:  ${code.toUpperCase()}`);
                console.log('=========================================');
                console.log('How to use:');
                console.log('1. Open WhatsApp on your phone.');
                console.log('2. Go to Settings -> Linked Devices -> Link a Device.');
                console.log('3. Tap "Link with phone number instead" at the bottom.');
                console.log('4. Enter the code above.');
                console.log('=========================================\n');
                console.log('⏳ Waiting for you to enter the code on your phone...');
            } catch (err) {
                console.error('❌ Failed to request pairing code:', err.message);
                pairingCodeRequested = false;
                // Don't exit — the connection.update 'close' handler will retry
            }
        }

        if (connection === 'open') {
            console.log('\n=========================================');
            console.log('🎉 SUCCESS! WhatsApp Connected Successfully!');
            console.log(`🤖 Logged in as: ${sock.user.name || sock.user.id}`);
            console.log('=========================================');
            console.log('Session saved to: sess/ directory');
            console.log('You can now start your bot with:');
            console.log('  pnpm start  or  node start.js');
            console.log('=========================================\n');
            retryCount = 0;
            process.exit(0);
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.message || 'Unknown';
            console.log(`🔄 Connection closed. Code: ${statusCode || '?'} | Reason: ${reason}`);
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('❌ Logged out! Clearing session...');
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
                process.exit(1);
            }
            
            retryCount++;
            if (retryCount > MAX_RETRIES) {
                console.log('❌ Max retries reached.');
                console.log('💡 Tips:');
                console.log('   - Make sure you removed old linked devices from WhatsApp');
                console.log('   - Delete the sess/ folder and try again');
                console.log('   - If on Codespaces/VPS, try from a different IP or local machine');
                console.log('   - Wait 5-10 minutes before trying again');
                process.exit(1);
            }

            // Reset pairing code flag so it gets re-requested on reconnect
            pairingCodeRequested = false;
            
            // Clean session on 405 errors (rejected by WhatsApp)
            if (statusCode === 405 || statusCode === 403) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
            }
            
            const backoffMs = Math.min(3000 * Math.pow(2, retryCount - 1), 60000);
            console.log(`🔄 Retrying in ${Math.round(backoffMs / 1000)}s... (attempt ${retryCount}/${MAX_RETRIES})`);
            await delay(backoffMs);
            startPairing(statusCode === 405 || statusCode === 403);
        }
    });
}

// Start fresh pairing
startPairing(true).catch(err => {
    console.error('Error starting pairing:', err);
});
