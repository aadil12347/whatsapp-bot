const { execSync } = require('child_process');
const fs = require('fs');

const oldQueen = execSync('git show 0d70c4e7f4a32557f272252ff4b91b554dc4d313~1:queen.js', { encoding: 'utf8' });
console.log('Old queen.js line count:', oldQueen.split('\n').length);

// Save old queen.js to scratch/old_queen.js
fs.writeFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\scratch\\old_queen.js', oldQueen);
console.log('Saved old_queen.js to scratch');
