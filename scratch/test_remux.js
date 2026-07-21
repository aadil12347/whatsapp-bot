const { execSync } = require('child_process');
const fs = require('fs');

try {
    console.log('Remuxing test_rick.mp4 to standard MP4 (+faststart)...');
    execSync(`ffmpeg -y -i test_rick.mp4 -c copy -movflags +faststart fixed_rick.mp4`);
    console.log('Remux finished!');

    const buf = fs.readFileSync('fixed_rick.mp4');
    console.log('Fixed file size:', buf.length);

    let offset = 0;
    while (offset < buf.length - 8) {
        const size = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        console.log(`Atom at offset ${offset} (0x${offset.toString(16)}): type="${type}", size=${size}`);
        if (size <= 1) break;
        offset += size;
    }
} catch(e) {
    console.error('Error:', e.message);
}
