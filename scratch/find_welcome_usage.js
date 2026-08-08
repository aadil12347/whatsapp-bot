const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

// Match hex for 322 + 0x2c6 = 0x408 (1032)
// Or search where sendMessage is called after connection open
const openIdx = queenContent.indexOf("connection === 'open'") || queenContent.indexOf("'open'");
console.log('Open index:', openIdx);

if (openIdx !== -1) {
    console.log(queenContent.substring(openIdx - 100, openIdx + 1500));
}
