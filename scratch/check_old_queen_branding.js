const fs = require('fs');

const oldQueenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\scratch\\old_queen.js', 'utf8');
const line1000 = oldQueenCode.split('\n')[999];

const match1 = line1000.match(/function _0x128c\(\)\{[\s\S]*?return _0x128c\(\);}/)[0];
const match2 = line1000.match(/const _0x353635=_0x43d6;[\s\S]*?const blocked=/)[0];
const match3 = line1000.match(/function _0x43d6\(_0x[a-f0-9]+,_0x[a-f0-9]+\)\{[\s\S]*?return _0x2264a7;\}/)[0];

const codeToEval = `
${match1}
${match3}
${match2.replace('const blocked=', '')}

let results = [];
for (let i = 0; i < 2000; i++) {
    try {
        let s = _0x353635(i);
        if (s && typeof s === 'string') {
            results.push({ idx: i, hex: '0x' + i.toString(16), val: s });
        }
    } catch(e) {}
}

console.log('Total decoded strings in old_queen.js:', results.length);
console.log('Old DanieWatch branding strings:');
results.filter(r => /danie|system|start|connect|online|owner/i.test(r.val)).forEach(r => {
    console.log('[' + r.hex + ' / ' + r.idx + '] => ' + JSON.stringify(r.val));
});
`;

eval(codeToEval);
