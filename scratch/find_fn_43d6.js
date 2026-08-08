const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const idx = content.indexOf('function _0x43d6');
console.log('function _0x43d6 index:', idx);

if (idx !== -1) {
    console.log('Snippet around _0x43d6:', content.substring(idx - 50, idx + 200));
} else {
    // Search for _0x43d6 in raw text
    let p = 0;
    while ((p = content.indexOf('_0x43d6', p)) !== -1) {
        console.log(`Found _0x43d6 at ${p}:`, content.substring(p - 20, p + 50));
        p += 7;
    }
}
