const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_youtube.js'), 'utf8');

function printCmd(pattern) {
    const idx = code.indexOf(`["pattern"]:"${pattern}"`);
    if (idx !== -1) {
        console.log(`=== COMMAND ${pattern} ===`);
        console.log(code.substring(idx - 10, idx + 2500));
    } else {
        console.log(`Pattern ${pattern} not found`);
    }
}

printCmd('video');
printCmd('yt2s');
printCmd('yt3s');
