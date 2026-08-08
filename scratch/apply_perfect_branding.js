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

// Apply exact array index replacements
arr[386] = "© DanieWatch Downloader Bot 💚 "; // Hex 0x60b
arr[1300] = "";                               // Hex 0x459
arr[256] = "🔥> DanieWatch Bot is ";          // Hex 0x589
arr[753] = "";                               // Hex 0x236
arr[1047] = "🔥 DanieWatch Bot ";            // Hex 0x35c
arr[777] = "conne";                          // Hex 0x24e
arr[752] = "ome.* Danie";                    // Hex 0x235
arr[536] = "Watch Bot i";                    // Hex 0x15d
arr[133] = "sing.\n\n> ";                    // Hex 0x50e
arr[688] = "DanieWatch Bot";                 // Hex 0x1f5

// Other general branding cleanups
arr[77] = " [⚡ DanieWatch Bot";
arr[250] = "DanieWatch Bot";
arr[266] = "Bot ⚡]";
arr[409] = "DanieWatch Bot ";
arr[438] = "DanieWatch";
arr[544] = "🚀 **DanieWatch_";
arr[589] = "DanieWatch-Bot";
arr[692] = "DanieWatch Bot";
arr[964] = "daniewatchbot";
arr[1085] = "006/daniewatch_";
arr[1098] = "DanieWatch";

const newArrayStr = JSON.stringify(arr).slice(1, -1);

let newQueenContent = queenContent.replace(
    /function _0x128c\(\)\{const _0x56b177=\[(.*?)\];_0x128c=/s,
    `function _0x128c(){const _0x56b177=[${newArrayStr}];_0x128c=`
);

// Remove the trailing 'ᗪ' character in the welcome message string concatenation
newQueenContent = newQueenContent.replace("+_0x5e0f4f(0x1f5)+'ᗪ'", "+_0x5e0f4f(0x1f5)");

fs.writeFileSync(queenPath, newQueenContent, 'utf-8');
console.log('🎉 Successfully applied perfect DanieWatch branding to queen.js!');
