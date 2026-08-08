const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((item, idx) => {
    if (typeof item === 'string' && (item.includes('E MD') || item.includes('MD connected') || item.includes('VERC') || item.includes('RC') || item.includes('connected'))) {
        console.log(`[${idx}]: ${JSON.stringify(item)}`);
    }
});
