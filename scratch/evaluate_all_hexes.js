const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const endIdx = queenContent.indexOf('async function handleStatusUpdate');
const setupCode = queenContent.substring(3651, endIdx);

const vm = require('vm');
const context = { console, require, process, Buffer, Map, RegExp, os: require('os') };
vm.createContext(context);
vm.runInContext(setupCode, context);

const _0x5e0f4f = context._0x43d6;

console.log('--- ALL EVALUATED HEX STRINGS FROM CLEAN QUEEN.JS ---');
for (let h = 0x100; h <= 0x670; h++) {
    try {
        const str = _0x5e0f4f(h);
        if (typeof str === 'string') {
            const s = str.toLowerCase();
            if (
                s.includes('xpro') || s.includes('verce') || s.includes('anju') || s.includes('queen') ||
                s.includes('rashmika') || s.includes('janith') || s.includes('proverce') || s.includes('welcome') ||
                s.includes('connected') || s.includes('starting') || s.includes('server listening')
            ) {
                console.log(`Hex 0x${h.toString(16)}: ${JSON.stringify(str)}`);
            }
        }
    } catch (e) {}
}
