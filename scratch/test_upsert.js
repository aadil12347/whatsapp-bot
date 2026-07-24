const EventEmitter = require('events');

// Mock connection with ev EventEmitter
const ev = new EventEmitter();
const conn = {
    user: { id: '923013068663@s.whatsapp.net' },
    ev: ev,
    sendMessage: async (from, content, options) => {
        console.log(`\n--- [WhatsApp Message Sent to ${from}] ---`);
        console.log(content.text || content.caption || content);
        console.log('------------------------------------\n');
        return { key: { id: 'mock_msg_' + Date.now() } };
    }
};

// Require danie_download.js which registers the upsert listener via initUpsertListener
require('../src/commands/danie_download');

async function runTest() {
    console.log('Simulating WhatsApp incoming message: ".si the house i built"...');
    
    // Simulate incoming message event
    ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
            {
                key: {
                    remoteJid: '17064693616661@lid',
                    participant: '923013068663:42@s.whatsapp.net',
                    fromMe: true
                },
                message: {
                    extendedTextMessage: {
                        text: '.si the house i built'
                    }
                },
                pushName: 'Danie'
            }
        ]
    });
}

// Allow handlers to initialize
setTimeout(runTest, 1000);
