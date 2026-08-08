const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const setupCode = queenContent.substring(3651, 32000);

const vm = require('vm');
const context = { console, require, process, Buffer, Map, RegExp, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(setupCode, context);

const _0x353635 = context._0x353635;

console.log('--- ALL DECODED STRINGS IN QUEEN.JS ---');
for (let i = 0x100; i <= 0x700; i++) {
    try {
        const val = _0x353635(i);
        if (typeof val === 'string') {
            const s = val.toLowerCase();
            if (
                s.includes('xpro') || s.includes('verce') || s.includes('anju') || s.includes('queen') ||
                s.includes('rashmika') || s.includes('janith') || s.includes('proverce') || s.includes('welcome') ||
                s.includes('connected') || s.includes('starting')
            ) {
                console.log(`0x${i.toString(16)} (${i}): ${JSON.stringify(val)}`);
            }
        }
    } catch (e) {}
}
