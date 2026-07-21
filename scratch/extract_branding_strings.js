const fs = require('fs');

const queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');
const line1000 = queenCode.split('\n')[999];

const func1 = line1000.match(/function _0x128c\(\)\{[\s\S]*?return _0x128c\(\);}/)[0];

const codeToEval = `
${func1}
const arr = _0x128c();
console.log('Total raw strings in array:', arr.length);
const branding = [];
arr.forEach((str, i) => {
    if (typeof str === 'string' && /anju|xpro|queen|alive|power|bot|rashmika/i.test(str)) {
        branding.push({ index: i, val: str });
    }
});
console.log('Branding strings in array:', JSON.stringify(branding, null, 2));
`;

eval(codeToEval);
