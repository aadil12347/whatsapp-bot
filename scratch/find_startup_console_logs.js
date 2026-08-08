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

for (let h = 0x100; h <= 0x670; h++) {
    try {
        const str = _0x5e0f4f(h);
        if (typeof str === 'string' && (str.toLowerCase().includes('listen') || str.toLowerCase().includes('starting') || str.includes('©') || str.includes('🔥'))) {
            console.log(`Hex 0x${h.toString(16)}: ${JSON.stringify(str)}`);
        }
    } catch (e) {}
}
