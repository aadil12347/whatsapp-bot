const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const endIdx = queenContent.indexOf('async function handleStatusUpdate');
const setupCode = queenContent.substring(3651, endIdx);

const vm = require('vm');
const context = {
    console: { log: () => {}, error: () => {}, warn: () => {} },
    require: () => ({}),
    process: { env: {} },
    Buffer, Map, RegExp,
    setTimeout: () => {},
    clearTimeout: () => {}
};
vm.createContext(context);
vm.runInContext(setupCode, context);

const _0x353635 = context._0x353635;

console.log('--- ALL DECODED STRINGS IN QUEEN.JS ---');
for (let i = 0; i < 1350; i++) {
    try {
        const hexArg = 0x2c6 + i;
        const val = _0x353635(hexArg);
        if (typeof val === 'string') {
            const s = val.toLowerCase();
            if (
                s.includes('xpro') || s.includes('verce') || s.includes('anju') || s.includes('queen') ||
                s.includes('rashmika') || s.includes('janith') || s.includes('proverce') || s.includes('welcome') ||
                s.includes('connected') || s.includes('starting') || s.includes('status') || s.includes('powered')
            ) {
                console.log(`0x${hexArg.toString(16)} (index ${i}): ${JSON.stringify(val)}`);
            }
        }
    } catch (e) {}
}
