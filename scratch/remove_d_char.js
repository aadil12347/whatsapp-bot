const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

let p = 0;
while ((p = queenContent.indexOf('ᗪ', p)) !== -1) {
    console.log(`Found ᗪ at ${p}:`, queenContent.substring(p - 30, p + 30));
    p += 1;
}

queenContent = queenContent.split("'ᗪ'").join("''").split('"ᗪ"').join('""').split('ᗪ').join('');
fs.writeFileSync(queenPath, queenContent, 'utf-8');
console.log('✅ Removed trailing ᗪ from queen.js!');
