const fs = require('fs');
const path = require('path');

// Hook eval or inspect youtube.js
const youtubeContent = fs.readFileSync(path.join(__dirname, '../src/commands/youtube.js'), 'utf8');

// Find all strings or functions registered in youtube.js
console.log('youtube.js length:', youtubeContent.length);

// We can mock cmd function from ../src/Utils/command to see what commands youtube.js registers!
const commandUtil = require('../src/Utils/command');
console.log('Existing registered commands count:', commandUtil.commands ? commandUtil.commands.length : 0);

try {
    require('../src/commands/youtube.js');
    console.log('After requiring youtube.js, registered commands count:', commandUtil.commands ? commandUtil.commands.length : 0);
    if (commandUtil.commands) {
        commandUtil.commands.forEach((c, i) => {
            console.log(`Command ${i}: name=${c.pattern || c.name || c.cmdName}, alias=${c.alias}, category=${c.category}`);
        });
    }
} catch (e) {
    console.error('Error requiring youtube.js:', e);
}
