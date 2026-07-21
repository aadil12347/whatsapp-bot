const fs = require('fs');

const queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');
const line1000 = queenCode.split('\n')[999];

// Find function definitions in line 1000
const funcs = line1000.match(/function\s+_0x[a-f0-9]+\([^)]*\)/g) || [];
console.log('Functions found in line 1000:', funcs);
