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

// Search for 0x60b, 0x589, 0x35c in queen.js
const hexCodes = [0x60b, 0x589, 0x35c];

hexCodes.forEach(h => {
    const hexStr = '0x' + h.toString(16);
    let p = 0;
    while ((p = queenContent.indexOf(hexStr, p)) !== -1) {
        console.log(`Snippet around ${hexStr} at ${p}:`);
        console.log(queenContent.substring(p - 20, p + 100));
        p += hexStr.length;
    }
});
