const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testSpeed() {
    const streamUrl = 'https://scalablecontentengine.site/8DZ5WpsK6/pl/H4sIAAAAAAAAAxXKXXeCIBgA4L8EqDl2t1botCCJF5I7hHXwZK19ND9._c6e64fgc4dQt8qfnHfe4zzvugylOQ3JOcty_yzLeNot7FCjD6KGddVe7a8H7iTIFkhWdQUfw3CPDeh5l4TifYhaLfZVFHgMIKOFColtOvkhmEbbvSoHdlRt6hdbHlH8OhI0e81inVQPt92PduE7noS3etG1vDEkWLWB60Rc_5MGvNZQRDBmS2pCj3KmvUd0xct1Ji.VdUo._EyFxoAahA8.0aO96U_b_zhzoXcOkxXQjg00yG34nW_iJNgLapZYmFLW2kyrfaEXYdhicdCA_w.T8qR7haKwBT0AqmZHsocy_BsUon9ZXHwKQQEAAA--/master.m3u8';
    const outFile = path.join(__dirname, 'speed_test.mp4');

    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    console.log('Testing FFmpeg -c copy (Direct stream copy)...');
    const startTime = Date.now();

    await new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-headers', `Referer: https://nextgencloudfabric.com/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`,
            '-t', '60', // 1 min sample
            '-i', streamUrl,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            outFile
        ];

        const ffmpeg = spawn('ffmpeg', args);
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`Code ${code}`)));
    });

    const durationSec = (Date.now() - startTime) / 1000;
    const stats = fs.statSync(outFile);
    console.log(`-c copy finished in ${durationSec.toFixed(2)} seconds. Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

testSpeed().catch(console.error);
