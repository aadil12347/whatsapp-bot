const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('anju-xpro-baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../session');

async function fetchGroups() {
    console.log('📡 Connecting to WhatsApp to fetch group list...');
    
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
            console.log('✅ Connected! Fetching participating groups...');
            try {
                const groups = await sock.groupFetchAllParticipating();
                const groupList = [];
                let idx = 1;
                
                for (const jid in groups) {
                    const g = groups[jid];
                    groupList.push({
                        number: idx++,
                        id: g.id,
                        subject: g.subject || 'Unnamed Group',
                        owner: g.owner || 'Unknown',
                        creation: g.creation ? new Date(g.creation * 1000).toISOString() : 'Unknown',
                        size: g.participants ? g.participants.length : 0,
                        isAnnounce: !!g.announce,
                        isEphemeral: !!g.ephemeralDuration
                    });
                }
                
                const outPath = path.join(__dirname, 'groups_list.json');
                fs.writeFileSync(outPath, JSON.stringify(groupList, null, 2), 'utf-8');
                
                console.log(`\n🎉 Found ${groupList.length} participating groups!`);
                console.log('==================================================');
                groupList.forEach(g => {
                    console.log(`[${g.number}] 👥 ${g.subject} | Members: ${g.size} | JID: ${g.id}`);
                });
                console.log('==================================================\n');
                
                setTimeout(() => {
                    sock.ws.close();
                    process.exit(0);
                }, 1000);
            } catch (err) {
                console.error('❌ Error fetching groups:', err);
                process.exit(1);
            }
        }
        
        if (connection === 'close') {
            const statusCode = update.lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== 200) {
                console.error(`⚠️ Disconnected with code ${statusCode}`);
            }
        }
    });
}

fetchGroups().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
