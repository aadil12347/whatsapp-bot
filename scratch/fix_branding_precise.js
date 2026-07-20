const fs = require('fs');
const path = require('path');

// 1. Update src/Utils/command.js to intercept alive and allow danie_download.js
const cmdPath = path.join(__dirname, '..', 'src', 'Utils', 'command.js');
let cmdTxt = fs.readFileSync(cmdPath, 'utf8');

const newCmdFunc = `const originalCmd = module.exports.cmd;
let danieListenerInitialized = false;

const ALLOWED_COMMANDS = [
    'sv', 'sr', 'sh',
    'alive', 'allow', 'disallow', 'addowner', 'delowner', 'addsudo', 'delsudo', 'owners', 'allowed', 'sudolist', 'config', 'setgroup', 'dlstatus', 'dlconfig', 'downloadstatus',
    'c', 'cancel', 'clearqueue', 'que', 'queue', 'q',
    'd', 'p',
    'jid', 'groupid'
];

module.exports.cmd = function(config, handler) {
    if (config && config.pattern) {
        const pat = config.pattern.toLowerCase();
        if (pat === 'alive') {
            const customAliveHandler = async (conn, mek, m, options) => {
                const senderJid = m ? (m.sender || mek.sender || options?.from) : (mek.sender || options?.from);
                const ownerNum = (process.env.BOT_NUMBER || '').trim();
                const sudoNums = (process.env.SUDO || '').split(',').map(n => n.trim()).filter(Boolean);
                const allOwners = ['94717775628', '94758775628', ownerNum, ...sudoNums];
                const cleanSender = (senderJid || '').split('@')[0];
                const isOwnerSender = mek?.key?.fromMe || allOwners.includes(cleanSender);
                if (!isOwnerSender) return;

                const danie = require('../commands/danie_download');
                if (danie.DANIE_COMMANDS && danie.DANIE_COMMANDS['alive']) {
                    const from = options?.from || m?.chat || mek?.key?.remoteJid;
                    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
                    return danie.DANIE_COMMANDS['alive'](conn, mek, from, senderJid, '', reply);
                }
            };
            return originalCmd(config, customAliveHandler);
        }

        if (config.filename && !config.filename.endsWith('danie_download.js')) {
            if (!ALLOWED_COMMANDS.includes(pat)) {
                config.pattern = 'disabled_' + pat;
                if (config.alias) config.alias = [];
                return;
            }
        }
    }

    const wrappedHandler = async (conn, mek, m, options) => {
        const senderJid = m ? (m.sender || mek.sender || options?.from) : (mek.sender || options?.from);
        const ownerNum = (process.env.BOT_NUMBER || '').trim();
        const sudoNums = (process.env.SUDO || '').split(',').map(n => n.trim()).filter(Boolean);
        const allOwners = ['94717775628', '94758775628', ownerNum, ...sudoNums];
        const cleanSender = (senderJid || '').split('@')[0];
        const isOwnerSender = mek?.key?.fromMe || allOwners.includes(cleanSender);
        if (!isOwnerSender) return;

        if (!danieListenerInitialized && conn) {
            danieListenerInitialized = true;
            try {
                const danie = require('../commands/danie_download');
                if (danie.initUpsertListener) {
                    danie.initUpsertListener(conn);
                    console.log('[DanieWatch] Listener auto-initialized via command execution');
                }
            } catch(e) {
                console.error('[DanieWatch] Auto-init error:', e.message);
            }
        }
        return handler(conn, mek, m, options);
    };

    return originalCmd(config, wrappedHandler);
};`;

const pStart = cmdTxt.indexOf('const originalCmd = module.exports.cmd;');
if (pStart !== -1) {
    cmdTxt = cmdTxt.slice(0, pStart) + newCmdFunc;
    fs.writeFileSync(cmdPath, cmdTxt, 'utf8');
    console.log('Updated command.js with alive handler override!');
}

// 2. Update queen.js array indices precisely
const queenPath = path.join(__dirname, '..', 'queen.js');
let queenTxt = fs.readFileSync(queenPath, 'utf8');

const fnIdx = queenTxt.indexOf('function _0x128c()');
const startIdx = queenTxt.indexOf('[', fnIdx);
const endIdx = queenTxt.indexOf('];_0x128c', fnIdx) + 1;

const arrRaw = queenTxt.slice(startIdx, endIdx);
const arr = eval(arrRaw);

// Precise Index Replacements in _0x128c
arr[386] = "© DanieWatch";
arr[636] = "";
arr[353] = " 💚\n\n🍂 𝐉𝐨";

arr[256] = "🚀 DanieWatch Bot is starting...";
arr[753] = "";
arr[227] = "";

arr[1047] = "✅ DanieWatch Bot connected successfully!";
arr[777] = "";
arr[1002] = "";

arr[794] = "\n---\nWelcome. DanieWatch Downloader Bot is online and ready for command processing.";
arr[536] = "";
arr[174] = "";
arr[1108] = "";

arr[133] = "\n\n> DanieWatch";
arr[688] = "";
arr[785] = "";

arr[250] = "DanieWatch";
arr[692] = "DanieWatch";

const newArrStr = JSON.stringify(arr);
queenTxt = queenTxt.slice(0, startIdx) + newArrStr + queenTxt.slice(endIdx);

fs.writeFileSync(queenPath, queenTxt, 'utf8');
console.log('Successfully updated queen.js string array precisely!');
