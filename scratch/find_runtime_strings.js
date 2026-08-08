const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const setupCode = queenContent.substring(queenContent.indexOf('const _0x353635='), queenContent.indexOf('async function getThumbnail'));
const vm = require('vm');
const context = { console, require, process, Buffer, Map, RegExp, setTimeout, clearTimeout };
vm.createContext(context);

vm.runInContext(setupCode, context);

const _0x353635 = context._0x353635;

console.log('--- ALL DECODED BRANDING STRINGS ---');
for (let i = 0x100; i < 0x700; i++) {
    try {
        const val = _0x353635(i);
        if (typeof val === 'string' && (
            val.includes('XPRO') || val.includes('VERCE') || val.includes('ANJU') || 
            val.includes('QUEEN') || val.includes('Rashmika') || val.includes('Janith') || 
            val.includes('PROVERCE') || val.includes('proverce') || val.includes('connected') ||
            val.includes('starting') || val.includes('Welcome') || val.includes('Welcome to')
        )) {
            console.log(`_0x353635(0x${i.toString(16)}): ${JSON.stringify(val)}`);
        }
    } catch (e) {}
}
