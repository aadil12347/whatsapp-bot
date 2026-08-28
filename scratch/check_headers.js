const fs = require('fs');
const path = require('path');

function scanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('===') || line.includes('***') || line.includes('╭') || line.includes('┌') || line.includes('───')) {
            // filter out pure code comments or structural lines
            if (line.includes('*') || line.includes('MENU') || line.includes('HELP') || line.includes('STATUS')) {
                console.log(`${path.relative(process.cwd(), filePath)}:${idx + 1}: ${line.trim()}`);
            }
        }
    });
}

function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            if (f !== 'node_modules' && f !== '.git' && f !== 'scratch' && f !== 'sess' && f !== 'session') {
                scanDir(full);
            }
        } else if (f.endsWith('.js')) {
            scanFile(full);
        }
    }
}

scanDir(process.cwd());
