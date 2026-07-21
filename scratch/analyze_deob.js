const fs = require('fs');
const path = require('path');

function analyzeFile(filename) {
    const code = fs.readFileSync(path.join(__dirname, filename), 'utf8');
    console.log(`=== ANALYZING ${filename} ===`);

    // Match all gBjoc / cmd calls
    const matches = code.match(/pattern["']?:\s*["']([^"']+)["']/g);
    if (matches) {
        console.log('Patterns found:', matches.map(m => m.match(/pattern["']?:\s*["']([^"']+)["']/)[1]));
    }

    // Look for cnv.cx / ytdl / video sending logic
    const fetchMatches = code.match(/https?:\/\/[^\s"'`]+/g);
    if (fetchMatches) {
        console.log('URLs found:', [...new Set(fetchMatches)]);
    }

    // Look for video / mimetype / sendMessage in code
    const videoSenders = code.match(/sendMessage\([^)]+video[^)]+\)/gi);
    if (videoSenders) {
        console.log('Video senders:', videoSenders);
    }
}

analyzeFile('deob_youtube.js');
analyzeFile('deob_download.js');
analyzeFile('deob_search.js');
analyzeFile('deob_logo.js');
