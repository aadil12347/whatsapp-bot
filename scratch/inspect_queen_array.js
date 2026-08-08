const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((str, i) => {
    if (typeof str === 'string') {
        const s = str.toLowerCase();
        if (
            s.includes('xpro') || s.includes('proverce') || s.includes('anju') ||
            s.includes('rashmika') || s.includes('janith') || s.includes('queen') ||
            str.includes('𝗫PRO') || str.includes('𝚅𝙴𝚁𝙲𝙴') || str.includes('𝚀𝚄𝙴𝙴𝙽') || str.includes('〽') ||
            str.includes('𝗫Ｐ𝗥Ｏ') || str.includes('𝗫PRO')
        ) {
            console.log(`[${i}]: ${JSON.stringify(str)}`);
        }
    }
});
