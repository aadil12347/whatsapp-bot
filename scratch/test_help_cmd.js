const { DANIE_COMMANDS } = require('../src/commands/danie_download');

console.log('🧪 Testing .help command formatting & execution...');

if (typeof DANIE_COMMANDS['help'] !== 'function') {
    throw new Error('DANIE_COMMANDS["help"] is not registered!');
}
if (typeof DANIE_COMMANDS['menu'] !== 'function') {
    throw new Error('DANIE_COMMANDS["menu"] alias is not registered!');
}

let outputMsg = '';
const mockConn = {
    sendMessage: async (from, payload) => {
        outputMsg = payload.caption || payload.text || '';
        return { key: { id: 'msg_1' } };
    }
};

const mockReply = async (msg) => {
    outputMsg = msg;
};

DANIE_COMMANDS['help'](mockConn, {}, '12345@s.whatsapp.net', '12345@s.whatsapp.net', '', mockReply)
    .then(() => {
        console.log('--- OUTPUT PREVIEW ---');
        console.log(outputMsg);
        console.log('--- END PREVIEW ---');
        if (!outputMsg.includes('DANIEWATCH BOT COMMAND MENU')) {
            throw new Error('Output does not contain header!');
        }
        console.log('✅ Help command test passed successfully!');
    })
    .catch(err => {
        console.error('❌ Test failed:', err);
        process.exit(1);
    });
