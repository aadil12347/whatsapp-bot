const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

const match = queenContent.match(/function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s);
if (!match) {
    console.error('Could not find _0x128c');
    process.exit(1);
}

const rawArrayStr = match[1];
const arr = eval('[' + rawArrayStr + ']');

console.log('Original array length:', arr.length);

// Index-based replacement mapping
const indexReplacements = {
    77: " [⚡ DanieWatch Bot",
    114: "daniewatch-bot-",
    241: "DanieWatch Bot ",
    250: "DanieWatch Bot",
    256: "🔥> DanieWatch Bot ",
    266: "Bot ⚡]",
    386: "© DanieWatch Bot ",
    409: "DanieWatch Bot ",
    438: "DanieWatch",
    536: "DanieWatch Bot i",
    544: "🚀 **DanieWatch_",
    589: "DanieWatch-Bot",
    688: "DanieWatch Bot",
    692: "DanieWatch Bot",
    752: "ome.* DanieWatch",
    753: "is ",
    785: "",
    964: "daniewatchbot",
    1047: "🔥 DanieWatch Bot ",
    1085: "006/daniewatch_",
    1098: "DanieWatch"
};

for (const [idxStr, newVal] of Object.entries(indexReplacements)) {
    const idx = parseInt(idxStr, 10);
    console.log(`Replacing arr[${idx}]: "${arr[idx]}" -> "${newVal}"`);
    arr[idx] = newVal;
}

const newArrayStr = JSON.stringify(arr).slice(1, -1); // strip surrounding [ and ]

const newQueenContent = queenContent.replace(
    /function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s,
    `function _0x128c(){const _0x56b177=[${newArrayStr}];_0x128c=`
);

fs.writeFileSync(queenPath, newQueenContent, 'utf-8');
console.log('🎉 Successfully updated queen.js branding!');
