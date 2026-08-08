const fs = require('fs');
const path = require('path');

const queenPath = path.join(__dirname, '../queen.js');
let queenContent = fs.readFileSync(queenPath, 'utf-8');

const replacements = [
    { old: '" [⚡ 𝗫Ｐ𝗥Ｏ𝗩𝗘"', new: '" [⚡ DanieWatch Bot"' },
    { old: '"anju-xpro-"', new: '"daniewatch-"' },
    { old: '"𝗫PRO𝚅𝙴𝚁𝙲𝙴\xa0"', new: '"DanieWatch Bot\xa0"' },
    { old: '"Anju XPRO"', new: '"DanieWatch Bot"' },
    { old: '"🔥> 𝗫PRO𝚅𝙴𝚁"', new: '"🔥> DanieWatch Bot "' },
    { old: '"𝗥𝗖𝗘 〽ᴅ ⚡]"', new: '"Bot ⚡]"' },
    { old: '"© 𝚀𝚄𝙴𝙴𝙽 𝙰𝙽"', new: '"© DanieWatch Bot "' },
    { old: '"XPROVerce "', new: '"DanieWatch Bot "' },
    { old: '"Rashmika-O"', new: '"DanieWatch"' },
    { old: '"Verce MD i"', new: '"DanieWatch Bot i"' },
    { old: '"🚀 **Queen_"', new: '"🚀 **DanieWatch_"' },
    { old: '"XPRO-MD-Bo"', new: '"DanieWatch-Bot"' },
    { old: '"PRO𝚅𝙴𝚁𝙲𝙴 〽"', new: '"DanieWatch Bot"' },
    { old: '"Xpro MD"', new: '"DanieWatch Bot"' },
    { old: '"ome.* XPRO"', new: '"ome.* DanieWatch"' },
    { old: '"𝙲𝙴\xa0\xa0〽ᗪ is "', new: '"is "' },
    { old: '"\xa0〽ᗪ"', new: '""' },
    { old: '"🔥 XPROVERC"', new: '"🔥 DanieWatch Bot "' },
    { old: '"R-Rashmika"', new: '"DanieWatch"' }
];

replacements.forEach(r => {
    if (queenContent.includes(r.old)) {
        console.log('Replacing:', r.old, '->', r.new);
        queenContent = queenContent.split(r.old).join(r.new);
    } else {
        console.warn('NOT FOUND:', r.old);
    }
});

fs.writeFileSync(queenPath, queenContent, 'utf-8');
console.log('✅ Updated queen.js with DanieWatch branding!');
