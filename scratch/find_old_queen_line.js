const fs = require('fs');

const oldQueenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\scratch\\old_queen.js', 'utf8');
const lines = oldQueenCode.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('_0x128c') || line.includes('_0x43d6') || line.includes('DanieWatch')) {
        console.log(`Line ${idx + 1} (${line.length} chars): ${line.substring(0, 100)}`);
    }
});
