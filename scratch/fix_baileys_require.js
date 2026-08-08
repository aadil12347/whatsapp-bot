const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr[114] = "anju-xpro-";

const newArrayStr = JSON.stringify(arr).slice(1, -1);

const newQueenContent = queenContent.replace(
    /function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s,
    `function _0x128c(){const _0x56b177=[${newArrayStr}];_0x128c=`
);

fs.writeFileSync(queenPath, newQueenContent, 'utf-8');
console.log('✅ Reverted index 114 to anju-xpro- for module resolution');
