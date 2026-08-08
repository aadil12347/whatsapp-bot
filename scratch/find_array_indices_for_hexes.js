const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

const targetHexes = [0x60b, 0x459, 0x589, 0x236, 0x65c, 0x35c, 0x24e, 0x32f, 0x235, 0x15d, 0x1dc, 0x50e, 0x1f5];

// To find array index for each hex: test setting arr[i] to a unique marker and check _0x43d6(hex)
const setupCode = queenContent.substring(3651, queenContent.indexOf('async function handleStatusUpdate'));
const vm = require('vm');
const context = { console, require, process, Buffer, Map, RegExp, os: require('os') };
vm.createContext(context);
vm.runInContext(setupCode, context);
const _0x353635 = context._0x43d6;

targetHexes.forEach(h => {
    const val = _0x353635(h);
    const arrIdx = arr.indexOf(val);
    console.log(`Hex 0x${h.toString(16)}: val=${JSON.stringify(val)} -> arr[${arrIdx}]`);
});
