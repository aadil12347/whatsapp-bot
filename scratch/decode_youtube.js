const fs = require('fs');
const path = require('path');

<<<<<<< HEAD
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
=======
const youtubeCode = fs.readFileSync(path.join(__dirname, '../src/commands/youtube.js'), 'utf8');

const iifeMatch = youtubeCode.match(/let vVWdb;!function\(\)\{[\s\S]*?\}\(\);/);
if (iifeMatch) {
    const evalCode = `var vVWdb; !function(){ ${iifeMatch[0].replace('let vVWdb;', '')} }(); global.vVWdb = vVWdb;`;
    eval(evalCode);
    
    const results = {};
    for (let i = 0; i < 200; i++) {
        for (let method of ['nB7ab', 'L5Bbb', 'jyzbb', 'bqWbb', 'L78bb', 'jsY9', 'DPQ9', 'bklab']) {
            try {
                const str = global.vVWdb[method](i);
                if (str && typeof str === 'string') {
                    results[`${method}(${i})`] = str;
                }
            } catch (e) {}
        }
    }
    console.log('Decoded strings:', JSON.stringify(results, null, 2));
>>>>>>> d73e30fa3e7fccd25d0cf3805d3afae6ca13fe4c
}
