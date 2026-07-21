const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'deob_youtube.js'), 'utf8');

// Find handlers for video, yt1s, yt2s, yt3s
const videoMatch = code.match(/pattern["']?:\s*["']video["'][\s\S]*?\n\}\);/);
if (videoMatch) console.log('=== VIDEO COMMAND ===\n', videoMatch[0].substring(0, 3000));

const yt2sMatch = code.match(/pattern["']?:\s*["']yt2s["'][\s\S]*?\n\}\);/);
if (yt2sMatch) console.log('=== YT2S COMMAND ===\n', yt2sMatch[0].substring(0, 3000));

const yt3sMatch = code.match(/pattern["']?:\s*["']yt3s["'][\s\S]*?\n\}\);/);
if (yt3sMatch) console.log('=== YT3S COMMAND ===\n', yt3sMatch[0].substring(0, 3000));

const converterMatch = code.match(/async function IuYlc[\s\S]*?return \{[\s\S]*?\};/);
if (converterMatch) console.log('=== IuYlc CONVERTER FUNCTION ===\n', converterMatch[0]);
