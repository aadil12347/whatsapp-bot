const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((item, idx) => {
    if (typeof item === 'string' && (item.toLowerCase().includes('connect') || item.toLowerCase().includes('welcome') || item.toLowerCase().includes('mode'))) {
        console.log(`[${idx}]: ${JSON.stringify(item)}`);
    }
});
