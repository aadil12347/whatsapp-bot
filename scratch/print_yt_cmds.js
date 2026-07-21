const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_youtube.js'), 'utf8');

// Find all gBjoc / cmd calls
const regex = /gBjoc\(\s*\{([^}]+)\}/g;
let m;
while ((m = regex.exec(code)) !== null) {
    console.log('--- COMMAND REGISTER ---');
    console.log(m[1].replace(/\s+/g, ' '));
}
