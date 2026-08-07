const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '../modules.tar.gz');
const CHUNK_SIZE = 45 * 1024 * 1024; // 45 MB

if (!fs.existsSync(inputFile)) {
    console.error('❌ modules.tar.gz not found!');
    process.exit(1);
}

const buffer = fs.readFileSync(inputFile);
const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
console.log(`📦 Splitting ${buffer.length} bytes into ${totalChunks} chunks of 45MB...`);

for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(buffer.length, start + CHUNK_SIZE);
    const chunk = buffer.subarray(start, end);
    const partName = path.join(__dirname, `../modules_part_${String.fromCharCode(97 + i)}.gz`);
    fs.writeFileSync(partName, chunk);
    console.log(`  ✅ Wrote ${partName} (${(chunk.length / 1024 / 1024).toFixed(2)} MB)`);
}

fs.unlinkSync(inputFile);
console.log('🗑️ Removed original modules.tar.gz');
