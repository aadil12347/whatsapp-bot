const fs = require('fs');

let queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');

const match1 = queenCode.match(/function _0x128c\(\)\{const _0x56b177=\[([\s\S]*?)\];_0x128c=function\(\)\{return _0x56b177;\};return _0x128c\(\);\}/)[0];

const arrCode = `${match1}; console.log(_0x128c().length); global.arr = _0x128c();`;
eval(arrCode);

const updatedArr = global.arr.map(item => {
    if (typeof item !== 'string') return item;
    let s = item;
    s = s.replace(/Anju\s*XPRO/gi, 'DanieWatch Bot');
    s = s.replace(/XPROVERCE/gi, 'DANIEWATCH');
    s = s.replace(/XPRO-MD-Bo/gi, 'DanieWatch-Bo');
    s = s.replace(/Xpro\s*MD/gi, 'DanieWatch Bot');
    s = s.replace(/Queen_Anju/gi, 'DanieWatch_Bot');
    s = s.replace(/Queen_/gi, 'DanieWatch_');
    s = s.replace(/anju-xpro-/gi, 'daniewatch-');
    s = s.replace(/anju_x/gi, 'daniewatch');
    s = s.replace(/anjubot3/gi, 'daniewatchbot');
    s = s.replace(/ro-botz-of/gi, 'daniewatch');
    s = s.replace(/Rashmika-O/gi, 'Daniyal-Aadil');
    s = s.replace(/R-Rashmika/gi, 'Daniyal-Aadil');
    return s;
});

const newArrayStr = `function _0x128c(){const _0x56b177=${JSON.stringify(updatedArr)};_0x128c=function(){return _0x56b177;};return _0x128c();}`;

queenCode = queenCode.replace(match1, newArrayStr);
fs.writeFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', queenCode);
console.log('✅ Successfully updated _0x128c array in queen.js!');
