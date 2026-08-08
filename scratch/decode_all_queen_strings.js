const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

// Let's create a script that modifies queen.js by replacing the entry point with console.log of strings
// Or we can just run queen.js in a VM with mock WASocket to capture all messages!
const vm = require('vm');

let capturedMessages = [];

const mockSock = {
    user: { id: '923253068800:1@s.whatsapp.net', name: 'Danie' },
    ev: {
        on: (event, handler) => {
            console.log('Registered event handler for:', event);
            if (event === 'connection.update') {
                setTimeout(() => {
                    try {
                        handler({ connection: 'open' });
                    } catch (e) {
                        console.error('Error during connection.update open:', e);
                    }
                }, 500);
            }
        }
    },
    sendMessage: async (jid, content, options) => {
        console.log('----------------------------------------------------');
        console.log(`📤 SEND MESSAGE to ${jid}:`);
        console.log(JSON.stringify(content, null, 2));
        console.log('----------------------------------------------------');
        capturedMessages.push({ jid, content, options });
    },
    sendPresenceUpdate: async () => {},
    newsletterMetadata: async () => ({ id: '123' }),
    groupFetchAllParticipating: async () => ({})
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

// Override require in VM
const moduleMap = {
    'anju-xpro-baileys': mockBaileys,
    'express': () => ({ use: () => {}, get: () => {}, listen: (port, cb) => cb && cb() }),
    'pino': () => ({ level: '' }),
    'axios': { get: async () => ({ data: {} }), post: async () => ({ data: {} }) },
    'file-type': { fromBuffer: async () => ({ mime: 'image/jpeg' }) },
    'adm-zip': class { extractAllTo() {} },
    'sharp': () => ({ resize: () => ({ toFormat: () => ({ toBuffer: async () => Buffer.from('') }), jpeg: () => ({ toBuffer: async () => Buffer.from('') }) }) }),
    'node-cache': class { get() {} set() {} has() { return false; } }
};

const customRequire = (mod) => {
    if (moduleMap[mod]) return moduleMap[mod];
    try {
        return require(mod);
    } catch (e) {
        return {};
    }
};

const context = {
    console: {
        log: (...args) => console.log('LOG:', ...args),
        error: (...args) => console.log('ERR:', ...args),
        warn: (...args) => console.log('WARN:', ...args)
    },
    require: customRequire,
    process: {
        ...process,
        env: {
            ...process.env,
            BOT_NUMBER: '923253068800',
            SUDO: '923253068800',
            OWNER_NAME: 'Danie',
            PORT: '3000'
        },
        exit: (code) => console.log('process.exit called with code:', code)
    },
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __dirname: path.join(__dirname, '..'),
    __filename: path.join(__dirname, '../queen.js')
};

vm.createContext(context);
try {
    vm.runInContext(queenContent, context);
} catch (e) {
    console.error('VM execution error:', e);
}
