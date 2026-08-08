const fs = require('fs');
const path = require('path');
const queenContent = fs.readFileSync(path.join(__dirname, '../queen.js'), 'utf-8');

const openIdx = queenContent.indexOf("if(!isAutoRestart){");
console.log('if(!isAutoRestart) pos:', openIdx);

if (openIdx !== -1) {
    console.log(queenContent.substring(openIdx, openIdx + 800));
}
