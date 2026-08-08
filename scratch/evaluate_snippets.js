const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const endIdx = queenContent.indexOf('async function handleStatusUpdate');
const setupCode = queenContent.substring(3651, endIdx);

const vm = require('vm');
const context = { console, require, process, Buffer, Map, RegExp, os: require('os') };
vm.createContext(context);
vm.runInContext(setupCode, context);

const _0x353635 = context._0x43d6;

console.log('=== SNIPPET 1 (SERVER LISTENING) ===');
console.log('0x60b:', JSON.stringify(_0x353635(0x60b)));
console.log('0x459:', JSON.stringify(_0x353635(0x459)));
console.log('0x592:', JSON.stringify(_0x353635(0x592)));
console.log('0x662:', JSON.stringify(_0x353635(0x662)));
console.log('0x261:', JSON.stringify(_0x353635(0x261)));
console.log('0x55c:', JSON.stringify(_0x353635(0x55c)));

console.log('=== SNIPPET 2 (STARTING MSG) ===');
console.log('0x589:', JSON.stringify(_0x353635(0x589)));
console.log('0x236:', JSON.stringify(_0x353635(0x236)));
console.log('0x65c:', JSON.stringify(_0x353635(0x65c)));

console.log('=== SNIPPET 3 (CONNECTED MSG) ===');
console.log('0x35c:', JSON.stringify(_0x353635(0x35c)));
console.log('0x24e:', JSON.stringify(_0x353635(0x24e)));
console.log('0x32f:', JSON.stringify(_0x353635(0x32f)));
