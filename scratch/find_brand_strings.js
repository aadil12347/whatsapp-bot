const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

// Extract _0x128c function definition
const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
if (!match) {
    console.error('Could not find _0x128c in queen.js');
    process.exit(1);
}

const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

arr.forEach((str, idx) => {
    if (typeof str === 'string' && (str.includes('XPRO') || str.includes('PROVERCE') || str.includes('QUEEN') || str.includes('ANJU') || str.includes('Rashmika') || str.includes('Janith'))) {
        console.log(`Index ${idx} (hex 0x${idx.toString(16)}): "${str}"`);
    }
});
