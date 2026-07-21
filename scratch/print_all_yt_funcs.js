const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_youtube.js'), 'utf8');

console.log('=== IuYlc ===');
const iuy = code.match(/async function IuYlc[\s\S]*?return \{[\s\S]*?\};?\s*\}/);
if (iuy) console.log(iuy[0]);

console.log('=== YT1S ===');
const yt1s = code.match(/["']pattern["']?:\s*["']yt1s["'][\s\S]*?\n\}\);/);
if (yt1s) console.log(yt1s[0]);

console.log('=== YT2S ===');
const yt2s = code.match(/["']pattern["']?:\s*["']yt2s["'][\s\S]*?\n\}\);/);
if (yt2s) console.log(yt2s[0]);

console.log('=== YT3S ===');
const yt3s = code.match(/["']pattern["']?:\s*["']yt3s["'][\s\S]*?\n\}\);/);
if (yt3s) console.log(yt3s[0]);
