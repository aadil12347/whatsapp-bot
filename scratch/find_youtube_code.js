const fs = require('fs');
const path = require('path');

function inspectFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    // Look for string table initializers or IIFE variable names
    const varMatch = code.match(/let\s+([a-zA-Z0-9_$]+);!function\(\)/);
    if (!varMatch) {
        console.log(`[Plain/Other] ${filePath}`);
        return;
    }
    const varName = varMatch[1];
    console.log(`[Obfuscated: ${varName}] ${filePath}`);

    // Try evaluating the IIFE to populate varName
    const firstLine = code.split('\n')[0] + '\n' + (code.split('\n')[1] || '').substring(0, 1000);
    const iifeMatch = code.match(/let\s+[a-zA-Z0-9_$]+;!function\(\)\{[\s\S]*?\}\(\);/);
    if (iifeMatch) {
        try {
            const evalCode = `${iifeMatch[0]}\n
            const strings = [];
            if (typeof ${varName} === 'object' && ${varName} !== null) {
                for (const k in ${varName}) {
                    if (typeof ${varName}[k] === 'function') {
                        try {
                            for (let i = 0; i < 200; i++) {
                                const val = ${varName}[k](i);
                                if (val && typeof val === 'string' && val.length > 1) {
                                    strings.push(val);
                                }
                            }
                        } catch(e) {}
                    }
                }
            }
            return strings;
            `;
            const strings = eval(`(function() { ${evalCode} })()`);
            const ytStrings = strings.filter(s => /yt|youtube|video|mp4|download|stream|fetch|ruhend|dylux/i.test(s));
            console.log(`  Extracted ${strings.length} strings. Matches:`, [...new Set(ytStrings)]);
        } catch(e) {
            console.log(`  Eval error: ${e.message}`);
        }
    }
}

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) scanDir(full);
        else if (f.endsWith('.js')) inspectFile(full);
    }
}

scanDir(path.join(__dirname, '../src'));
