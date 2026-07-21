const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_download.js'), 'utf8');

const regex = /["']pattern["']?\s*:\s*["']([^"']+)["']/g;
let m;
while ((m = regex.exec(code)) !== null) {
    console.log('Download command:', m[1]);
}
