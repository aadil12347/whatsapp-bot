const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((item, index) => {
    if (typeof item === 'string') {
        if (item.includes('𝙹𝚄') || item.includes('𝗑ᴾᴿᴼ') || item.includes('<ctrl42>') || item.includes('𝚀𝚄𝙴𝙴𝙽') || item.includes('𝙰𝙽𝙹𝚄') || item.includes('𝗑ᴾ')) {
            console.log(`[${index}]: ${JSON.stringify(item)}`);
        }
    }
});
