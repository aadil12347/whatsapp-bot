const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('anju-xpro-baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const SESSION_DIR = path.join(__dirname, 'session');

let pairingCodeRequested = false;
let retryCount = 0;
const MAX_RETRIES = 5;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startPairing(cleanStart = true) {
    try { require('./src/Utils/singleInstance').killPreviousInstances(); } catch(e) {}
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
        console.log('Please edit the file named "config.env" in the root directory and add your number:');
        console.log('----------------------------------------');
        console.log('BOT_NUMBER=923013068663');
        console.log('----------------------------------------');
        process.exit(1);
    }

    botNumber = botNumber.replace(/[^0-9]/g, '');
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['Chrome (Linux)', '', ''],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 250,
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    console.log(`🤖 Target Phone Number: +${botNumber}`);
    console.log('⏳ Connecting to WhatsApp servers...');

    // Wait for socket to be ready before requesting pairing code
    if (!pairingCodeRequested) {
        // Give the socket time to connect before requesting pairing code
        await delay(5000);
        
        if (!sock.authState.creds.registered) {
            pairingCodeRequested = true;
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
                console.log('Waiting for authorization from WhatsApp... Keep this terminal open.');
            } catch (err) {
                console.error('❌ Failed to request pairing code:', err.message);
                pairingCodeRequested = false;
            }
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            console.log('\n=========================================');
            console.log('🎉 SUCCESS! WhatsApp Connected Successfully!');
            console.log(`🤖 Logged in as: ${sock.user.name || sock.user.id}`);
            console.log('=========================================');
            console.log('You can now close this terminal and start your bot with:');
            console.log('  pnpm start  or  node start.js');
            console.log('=========================================\n');
            retryCount = 0;
            process.exit(0);
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔄 Socket connection closed. Status Code: ${statusCode || 'unknown'}`);
            
            // 405 = Method Not Allowed — session/auth is rejected by WhatsApp
            // 401 = Unauthorized — logged out
            // 403 = Forbidden — banned
            // 440 = loggedOut
            if (statusCode === 405 || statusCode === 403) {
                retryCount++;
                if (retryCount > MAX_RETRIES) {
                    console.log('❌ Max retries reached with 405 error.');
                    console.log('💡 Possible causes:');
                    console.log('   - WhatsApp servers are temporarily blocking rapid connections');
                    console.log('   - Your IP might be rate-limited (common in Codespaces/VPS)');
                    console.log('   - Try again after waiting 5-10 minutes');
                    console.log('   - Try from a different network/IP if the issue persists');
                    process.exit(1);
                }
                
                // Clear corrupted session data and retry with exponential backoff
                console.log(`⚠️  Got 405 error. Clearing session and retrying... (attempt ${retryCount}/${MAX_RETRIES})`);
                try {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                } catch (e) {}
                
                // Reset pairing code flag so it gets re-requested
                pairingCodeRequested = false;
                
                // Exponential backoff: 10s, 20s, 40s, 80s, 160s
                const backoffMs = Math.min(10000 * Math.pow(2, retryCount - 1), 120000);
                console.log(`⏳ Waiting ${backoffMs / 1000} seconds before retrying...`);
                await delay(backoffMs);
                startPairing(true);
                
            } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                console.log('❌ Connection logged out! Clearing session directory...');
                try {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                } catch (e) {}
                process.exit(1);
                
            } else {
                // Other errors — retry with backoff
                retryCount++;
                if (retryCount > MAX_RETRIES) {
                    console.log('❌ Max retries reached. Please try again later.');
                    process.exit(1);
                }
                
                pairingCodeRequested = false;
                const backoffMs = Math.min(5000 * retryCount, 30000);
                console.log(`🔄 Reconnecting in ${backoffMs / 1000}s... (attempt ${retryCount}/${MAX_RETRIES})`);
                await delay(backoffMs);
                startPairing(false);
            }
        }
    });
}

// Clean start to pair fresh
startPairing(true).catch(err => {
    console.error('Error starting pairing:', err);
});
