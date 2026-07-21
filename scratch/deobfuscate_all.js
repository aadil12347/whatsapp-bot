const fs = require('fs');
const path = require('path');

function deobfuscateFile(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const varMatch = code.match(/let\s+([a-zA-Z0-9_$]+);!function\(\)/);
    if (!varMatch) return;
    const varName = varMatch[1];

    // Evaluate the setup function
    const iifeEndIndex = code.indexOf('}();') + 4;
    const iifeCode = code.substring(0, iifeEndIndex);

    try {
        const fn = new Function(`${iifeCode}; return ${varName};`);
        const table = fn();

        // Get key mapping function names
        const funcNames = Object.keys(table).filter(k => typeof table[k] === 'function');
        
        let deob = code;
        for (const fnName of funcNames) {
            // Replace varName.fnName(index) calls with evaluated string
            const regex = new RegExp(`${varName}\\.${fnName}\\((\\d+)\\)`, 'g');
            deob = deob.replace(regex, (match, idx) => {
                try {
                    const str = table[fnName](parseInt(idx, 10));
                    if (str !== undefined) return JSON.stringify(str);
                } catch(e) {}
                return match;
            });
        }

        const outPath = path.join(__dirname, 'deob_' + path.basename(filePath));
        fs.writeFileSync(outPath, deob);
        console.log(`Deobfuscated ${filePath} -> ${outPath}`);
    } catch(e) {
        console.error(`Error deobfuscating ${filePath}: ${e.message}`);
    }
}

deobfuscateFile(path.join(__dirname, '../src/commands/youtube.js'));
deobfuscateFile(path.join(__dirname, '../src/commands/download.js'));
deobfuscateFile(path.join(__dirname, '../src/commands/search.js'));
deobfuscateFile(path.join(__dirname, '../src/commands/logo.js'));
