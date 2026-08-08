const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((item, idx) => {
    if (typeof item === 'string') {
        const s = item.toLowerCase();
        if (s.includes('connect') || s.includes('welcome') || s.includes('online') || s.includes('alive') || s.includes('version')) {
            console.log(`[${idx}]: ${JSON.stringify(item)}`);
        }
    }
});
