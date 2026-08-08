const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

// Set exact clean values for welcome caption
arr[349] = ""; // 0x15d
arr[476] = "DanieWatch Bot i"; // 0x1dc
arr[1294] = "sing.\n\n> "; // 0x50e
arr[501] = "DanieWatch Bot"; // 0x1f5

const newArrayStr = JSON.stringify(arr).slice(1, -1);

let newQueenContent = queenContent.replace(
    /function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s,
    `function _0x128c(){const _0x56b177=[${newArrayStr}];_0x128c=`
);

// Remove the trailing 'ᗪ' character in the welcome message string concatenation
newQueenContent = newQueenContent.replace("+_0x5e0f4f(0x1f5)+'ᗪ'", "+_0x5e0f4f(0x1f5)");

fs.writeFileSync(queenPath, newQueenContent, 'utf-8');
console.log('🎉 Successfully fixed welcome caption text in queen.js!');
