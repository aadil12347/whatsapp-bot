/**
 * Quick script to fetch all participating groups from the connected WhatsApp session.
 * Uses the same Baileys setup as the main bot.
 */
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const pino = require('pino');

const SESSION_DIR = path.join(__dirname, '..', 'session');

(async () => {
    console.log('🔌 Connecting to WhatsApp to fetch groups...\n');

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['DanieWatch', 'Chrome', '120.0.0'],
        connectTimeoutMs: 30000,
    });

    conn.ev.on('creds.update', saveCreds);

    // Wait for connection
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
        conn.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                clearTimeout(timeout);
                resolve();
            }
            if (connection === 'close') {
                clearTimeout(timeout);
                reject(new Error('Connection closed: ' + (lastDisconnect?.error?.message || 'unknown')));
            }
        });
    });

    console.log('✅ Connected! Fetching groups...\n');

    const groupsObj = await conn.groupFetchAllParticipating();
    const groups = Object.values(groupsObj);

    console.log(`Found ${groups.length} group(s):\n`);
    console.log('═══════════════════════════════════════════════════');
    groups.forEach((g, idx) => {
        const memberCount = g.participants ? g.participants.length : '?';
        console.log(`  ${String(idx + 1).padStart(2)}. ${g.subject}`);
        console.log(`      JID: ${g.id}`);
        console.log(`      Members: ${memberCount}`);
        console.log('');
    });
    console.log('═══════════════════════════════════════════════════');

    // Disconnect cleanly
    await conn.end();
    process.exit(0);
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
