const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('anju-xpro-baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../session');
const GROUP_JID = '120363263215689587@g.us';

async function fetchRecentMessages() {
    console.log('📡 Connecting to WhatsApp to fetch group 10 messages...');
    
    const { state } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        
        if (connection === 'open') {
            console.log('✅ Connected! Fetching message store / chat messages...');
            try {
                // Try fetching group metadata first
                const meta = await sock.groupMetadata(GROUP_JID);
                console.log(`📌 Group Subject: ${meta.subject}`);
                console.log(`📌 Total Participants: ${meta.participants.length}`);

                setTimeout(() => {
                    sock.ws.close();
                    process.exit(0);
                }, 2000);
            } catch (err) {
                console.error('❌ Error fetching messages:', err);
                process.exit(1);
            }
        }
    });
}

fetchRecentMessages().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
