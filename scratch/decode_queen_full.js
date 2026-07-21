const fs = require('fs');

const queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');
const line1000 = queenCode.split('\n')[999];

const func1 = line1000.match(/function _0x128c\(\)\{[\s\S]*?return _0x128c\(\);}/)[0];
const func2 = line1000.match(/function _0x43d6\(_0x[a-f0-9]+,_0x[a-f0-9]+\)\{[\s\S]*?return _0x43d6\(_0x[a-f0-9]+,_0x[a-f0-9]+\);}/)[0];
const iife = line1000.match(/\(function\(_0x4e44aa,_0x5b5015\)[\s\S]*?\)\(_0x128c,0x[a-f0-9]+\);/)[0];

const codeToEval = `
${func1}
${iife}
${func2}

let all = [];
for (let i = 0x100; i < 0x700; i++) {
    try {
        let s = _0x43d6(i);
        if (s && typeof s === 'string') all.push({ hex: '0x' + i.toString(16), dec: i, val: s });
    } catch(e) {}
}
console.log('Total extracted:', all.length);
console.log('Branding items:', JSON.stringify(all.filter(s => /anju|xpro|queen|alive|power|bot/i.test(s.val)), null, 2));
`;

eval(codeToEval);
