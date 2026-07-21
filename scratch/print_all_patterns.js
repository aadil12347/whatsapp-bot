const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_youtube.js'), 'utf8');

function findPattern(name) {
    const key = `["pattern"]:"${name}"`;
    const idx = code.indexOf(key);
    if (idx !== -1) {
        // Find next gBjoc or end of file
        const nextIdx = code.indexOf('gBjoc({', idx + key.length);
        const chunk = nextIdx !== -1 ? code.substring(idx, nextIdx) : code.substring(idx);
        console.log(`\n================= PATTERN: ${name} =================\n`);
        console.log(chunk);
    } else {
        console.log(`Pattern ${name} not found`);
    }
}

['song', 'songdl', 'yt1s', 'yts', 'yts1', 'video', 'yt2s', 'yt3s', 'csong', 'csongdl'].forEach(findPattern);
