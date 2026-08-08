const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((item, idx) => {
    if (typeof item === 'string') {
        const s = item.toLowerCase();
        if (s.includes('welcome') || s.includes('enjoy') || s.includes('thanks for using') || s.includes('xpro') || s.includes('proverce') || s.includes('anju') || s.includes('rashmika') || s.includes('janith')) {
            console.log(`[${idx}]: ${JSON.stringify(item)}`);
        }
    }
});
