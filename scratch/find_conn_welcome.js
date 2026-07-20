const fs = require('fs');
const path = require('path');

const txt = fs.readFileSync(path.join(__dirname, '..', 'queen.js'), 'utf8');

// Search for welcome message sending in queen.js
const matches = [...txt.matchAll(/welcome/gi)];
matches.forEach(m => {
    const idx = m.index;
    console.log(txt.slice(Math.max(0, idx - 150), Math.min(txt.length, idx + 150)));
    console.log('===');
});
