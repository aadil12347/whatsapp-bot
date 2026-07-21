const { execSync } = require('child_process');
const fs = require('fs');

console.log('Restoring DanieWatch queen.js from commit 724c18452d4d2e3922c9928cc4abf2253ae52c82...');
const danieQueen = execSync('git show 724c18452d4d2e3922c9928cc4abf2253ae52c82:queen.js', { encoding: 'utf8' });
fs.writeFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', danieQueen);
console.log('✅ Successfully restored DanieWatch queen.js!');
