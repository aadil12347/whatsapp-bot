const { execSync } = require('child_process');

const oldCode = execSync('git show 0d70c4e7f4a32557f272252ff4b91b554dc4d313~1:queen.js', { encoding: 'utf8' });
const newCode = execSync('git show HEAD:queen.js', { encoding: 'utf8' });

const oldLine = oldCode.split('\n')[999];
const newLine = newCode.split('\n')[999];

console.log('Old line 1000 length:', oldLine.length);
console.log('New line 1000 length:', newLine.length);

// Compare string arrays in old vs new
function extractArray(line) {
    const match = line.match(/function _0x128c\(\)\{[\s\S]*?return _0x128c\(\);}/)[0];
    const code = `${match}; _0x128c();`;
    return eval(code);
}

const oldArr = extractArray(oldLine);
const newArr = extractArray(newLine);

console.log('Old array len:', oldArr.length);
console.log('New array len:', newArr.length);

// Find differences
const diffs = [];
for (let i = 0; i < Math.max(oldArr.length, newArr.length); i++) {
    if (oldArr[i] !== newArr[i]) {
        diffs.push({ i, old: oldArr[i], new: newArr[i] });
    }
}

console.log('Differences count:', diffs.length);
console.log('Differences sample:', diffs.slice(0, 30));
