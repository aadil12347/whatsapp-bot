const fs = require('fs');
const path = require('path');

const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

// Search for 'connection' or 'update'
let p = 0;
while ((p = queenContent.indexOf('connection', p)) !== -1) {
    console.log(`Found 'connection' at ${p}:`, queenContent.substring(p - 30, p + 100));
    p += 10;
}
