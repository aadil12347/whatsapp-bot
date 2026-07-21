const fs = require('fs');
const path = require('path');

function searchDir(dir, matches = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'scratch' || file === '.system_generated') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath, matches);
        } else if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.env')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                // Filter out junk regexes like x264/x265/cleanJunkWords
                if (line.includes('cleanJunkWords') || line.includes('junkRegexes')) return;
                if (/xproverce|anju|rashmika|queen_anju|king-rashmika/i.test(line)) {
                    matches.push({ file: path.relative(dir, fullPath), lineNum: idx + 1, text: line.trim() });
                }
            });
        }
    }
    return matches;
}

const results = searchDir('e:\\0.1 Github Repo\\Whatsapp Bot Automation');
console.log(`Found ${results.length} occurrences of old branding:\n`);
results.forEach(r => {
    console.log(`[${r.file}:${r.lineNum}] ${r.text.substring(0, 120)}`);
});
