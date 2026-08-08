const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
if (!match) {
    console.error('Could not find _0x128c');
    process.exit(1);
}

const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

console.log('Total items in array:', arr.length);

arr.forEach((item, index) => {
    if (typeof item === 'string') {
        const lower = item.toLowerCase();
        if (
            lower.includes('xpro') || lower.includes('verce') || lower.includes('anju') ||
            lower.includes('queen') || lower.includes('rashmika') || lower.includes('janith') ||
            item.includes('𝗫PRO') || item.includes('𝚅𝙴𝚁𝙲𝙴') || item.includes('𝚀𝚄𝙴𝙴𝙽') ||
            item.includes('𝗫Ｐ𝗥Ｏ') || item.includes('〽')
        ) {
            console.log(`[${index}]: ${JSON.stringify(item)}`);
        }
    }
});
