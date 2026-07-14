const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting your custom DanieWatch Downloader Bot...');

const botBrainPath = path.join(__dirname, 'queen.js');

if (!fs.existsSync(botBrainPath)) {
    console.error('❌ Error: queen.js is missing! Please make sure the brain file is in the folder.');
    process.exit(1);
}

// Start the bot process
const child = fork(botBrainPath, [], {
    stdio: 'inherit',
    windowsHide: true
});

child.on('error', (err) => {
    console.error('❌ Bot crashed with error:', err.message);
});

child.on('exit', (code) => {
    console.log(`🤖 Bot process exited with code ${code}`);
});