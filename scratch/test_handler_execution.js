const { DANIE_COMMANDS } = require('../src/commands/danie_download');

async function test() {
    console.log('Testing DANIE_COMMANDS["si"] with query "the house i built"...');
    const conn = {
        sendMessage: async (from, content, options) => {
            console.log(`[MockConn.sendMessage] to=${from}:`, content.text || content.caption || content);
            return { key: { id: 'mock_msg_' + Date.now() } };
        }
    };
    const mek = { key: { remoteJid: 'test@s.whatsapp.net', fromMe: true }, message: { conversation: '.si the house i built' } };
    const from = 'test@s.whatsapp.net';
    const senderJid = '923013068663@s.whatsapp.net';
    const reply = async (txt) => conn.sendMessage(from, { text: txt });

    await DANIE_COMMANDS['si'](conn, mek, from, senderJid, 'the house i built', reply);
}

test().catch(console.error);
