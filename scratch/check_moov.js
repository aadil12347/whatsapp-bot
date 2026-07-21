const fs = require('fs');

const buf = fs.readFileSync('test_rick.mp4');
console.log('Total file length:', buf.length);

let offset = 0;
while (offset < buf.length - 8) {
    const size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    console.log(`Atom at offset ${offset} (0x${offset.toString(16)}): type="${type}", size=${size}`);
    if (size <= 1) break;
    offset += size;
}
