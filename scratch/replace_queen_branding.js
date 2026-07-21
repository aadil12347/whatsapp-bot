const fs = require('fs');

let queenCode = fs.readFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', 'utf8');

const replacements = [
    { from: '"Anju XPRO"', to: '"DanieWatch"' },
    { from: '"XPROVerce "', to: '"DanieWatch "' },
    { from: '"🚀 **Queen_"', to: '"🚀 **DanieWatch_"' },
    { from: '"XPRO-MD-Bo"', to: '"DanieWatch-Bo"' },
    { from: '"Xpro MD"', to: '"DanieWatch Bot"' },
    { from: '"🔥 XPROVERC"', to: '"🔥 DANIEWATCH"' },
    { from: '"anju-xpro-"', to: '"daniewatch-"' },
    { from: '"006/anju_x"', to: '"aadil/daniewatch"' },
    { from: '"ro-botz-of"', to: '"daniewatch"' },
    { from: '"anjubot3"', to: '"daniewatchbot"' }
];

let modified = queenCode;
replacements.forEach(r => {
    while (modified.includes(r.from)) {
        modified = modified.replace(r.from, r.to);
    }
});

fs.writeFileSync('e:\\0.1 Github Repo\\Whatsapp Bot Automation\\queen.js', modified);
console.log('✅ Updated queen.js string array branding!');
