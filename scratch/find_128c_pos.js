const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

console.log('_0x353635 pos:', queenContent.indexOf('const _0x353635'));
console.log('function _0x128c pos:', queenContent.indexOf('function _0x128c'));
console.log('function _0x43d6 pos:', queenContent.indexOf('function _0x43d6'));
