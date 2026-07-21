const fs = require('fs');

const queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');
console.log('Total length of queen.js:', queenCode.length);

const line1000 = queenCode.split('\n')[999]; // 0-indexed line 1000
console.log('Line 1000 preview:', line1000.substring(0, 300));

// Let's search line 1000 for hex strings or string array functions
const strings = line1000.match(/["']([^"']{3,100})["']/g) || [];
console.log('Strings in line 1000 count:', strings.length);

// Let's filter strings containing Anju, Queen, Xpro, Alive, etc.
const filtered = strings.map(s => s.slice(1, -1)).filter(s => /anju|queen|xpro|alive|power|bot/i.test(s));
console.log('Interesting strings in line 1000:', [...new Set(filtered)]);
