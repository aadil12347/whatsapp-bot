const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const endIdx = queenContent.indexOf('async function handleStatusUpdate');
const setupCode = queenContent.substring(3651, endIdx);

const vm = require('vm');
const context = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    require: () => ({}), process: { env: {} }, Buffer, Map, RegExp,
    setTimeout: () => {}, clearTimeout: () => {}
};
vm.createContext(context);
vm.runInContext(setupCode, context);

const _0x353635 = context._0x353635;

console.log('--- WELCOME MESSAGE PIECES ---');
const offsets = [0x434, 0x61d, 0x4f6, 0x400, 0x3d4, 0x61d, 0x4dd, 0x5f5, 0x211, 0x5e5, 0x453, 0x4bc, 0x306, 0x39c, 0x3d8, 0x625, 0x2a5, 0x3f4, 0x40d, 0x25f, 0x235, 0x15d, 0x1dc, 0x537, 0x49c, 0x399, 0x26d, 0x1b4, 0x637, 0x35f, 0x2c9, 0x1d0, 0x613, 0x50e, 0x1f5];

let fullMsg = '';
offsets.forEach(off => {
    try {
        const str = _0x353635(off);
        console.log(`0x${off.toString(16)}: ${JSON.stringify(str)}`);
        fullMsg += str;
    } catch (e) {
        console.log(`0x${off.toString(16)}: [ERR: ${e.message}]`);
    }
});

console.log('--- ASSEMBLED WELCOME MESSAGE ---');
console.log(fullMsg);
