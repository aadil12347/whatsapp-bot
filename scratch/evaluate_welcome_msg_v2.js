const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

// Require queen.js with mocked WASocket so we can intercept the exact caption sent to sendMessage
const vm = require('vm');

let welcomeCaption = null;

const mockSock = {
    user: { id: '923253068800:1@s.whatsapp.net', name: 'Danie' },
    ev: {
        on: (event, handler) => {
            if (event === 'connection.update') {
                setTimeout(() => {
                    handler({ connection: 'open' });
                }, 100);
            }
        }
    },
    sendMessage: async (jid, content, options) => {
        console.log('Intercepted sendMessage to:', jid);
        if (content && content.caption) {
            welcomeCaption = content.caption;
            console.log('=== CAPTION SENT TO WHATSAPP ===');
            console.log(content.caption);
            console.log('=================================');
        }
    },
    sendPresenceUpdate: async () => {}
};

const mockBaileys = {
    default: () => mockSock,
    useMultiFileAuthState: async () => ({ state: { creds: { registered: true }, keys: {} }, saveCreds: () => {} }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1015901307] }),
    makeCacheableSignalKeyStore: (keys) => keys,
    Browsers: { ubuntu: () => 'Chrome' },
    DisconnectReason: { loggedOut: 401 },
    jidNormalizedUser: (id) => id,
    getContentType: () => 'conversation',
    BufferJSON: { replacer: () => {}, reviver: () => {} },
    WA_DEFAULT_EPHEMERAL: 0,
    generateWAMessageFromContent: () => ({}),
    proto: {},
    getBinaryNodeChildren: () => [],
    generateWAMessageContent: () => ({}),
    generateWAMessage: () => ({}),
    prepareWAMessageMedia: () => ({}),
    areJidsSameUser: () => true,
    decryptPollVote: () => ({}),
    downloadContentFromMessage: () => {}
};

const customRequire = (mod) => {
    if (mod === 'anju-xpro-baileys') return mockBaileys;
    if (mod === 'express') return () => ({ use: () => {}, get: () => {}, listen: (port, cb) => cb && cb() });
    if (mod === 'pino') return () => ({ level: '' });
    if (mod === 'axios') return { get: async () => ({ data: Buffer.from('') }), post: async () => ({ data: {} }) };
    if (mod === 'file-type') return { fromBuffer: async () => ({ mime: 'image/jpeg' }) };
    if (mod === 'adm-zip') return class { extractAllTo() {} };
    if (mod === 'sharp') return () => ({ resize: () => ({ toFormat: () => ({ toBuffer: async () => Buffer.from('') }), jpeg: () => ({ toBuffer: async () => Buffer.from('') }) }) });
    if (mod === 'node-cache') return class { get() {} set() {} has() { return false; } };
    try { return require(mod); } catch (e) { return {}; }
};

const context = {
    console: { log: () => {}, error: (err) => console.log('VM ERR:', err), warn: () => {} },
    require: customRequire,
    process: {
        ...process,
        env: {
            BOT_NUMBER: '923253068800',
            SUDO: '923253068800',
            OWNER_NAME: 'Danie',
            PORT: '3000'
        },
        exit: () => {}
    },
    Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    __dirname: path.join(__dirname, '..'),
    __filename: path.join(__dirname, '../queen.js')
};

vm.createContext(context);
vm.runInContext(queenContent, context);

setTimeout(() => {
    if (!welcomeCaption) console.log('No caption intercepted.');
    process.exit(0);
}, 2000);
