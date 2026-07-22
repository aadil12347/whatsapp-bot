const { searchStreamImdb, getMediaDetails, resolveStreamOptions, verifyMediaFile } = require('../src/Utils/streamimdb_scraper');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function testSampleDownload() {
    console.log('1. Searching for "Obsession"...');
    const results = await searchStreamImdb('Obsession');
    const movie = results[0];

    console.log('2. Fetching details...');
    const details = await getMediaDetails(movie.href);

    console.log('3. Resolving stream options...');
    const qualities = await resolveStreamOptions(details.embedUrl);
    console.log('Qualities found:', qualities);

    if (qualities.length === 0) throw new Error('No qualities found');

    const streamUrl = qualities[0].streamUrl;
    const testFile = path.join(__dirname, 'sample_test.mp4');

    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

    console.log('4. Running FFmpeg download (limiting to 30 seconds / ~10MB)...');
    
    await new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-headers', `Referer: https://nextgencloudfabric.com/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`,
            '-t', '30', // limit to 30 seconds
            '-i', streamUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            testFile
        ];

        console.log(`Command: ffmpeg ${args.join(' ')}`);
        const ffmpeg = spawn('ffmpeg', args);

        let errData = '';
        ffmpeg.stderr.on('data', d => errData += d.toString());

        ffmpeg.on('close', code => {
            if (code === 0 && fs.existsSync(testFile)) {
                console.log('FFmpeg download completed successfully.');
                resolve();
            } else {
                reject(new Error(`FFmpeg failed (${code}): ${errData.slice(-500)}`));
            }
        });
    });

    console.log('5. Verifying media file with FFprobe...');
    const verification = await verifyMediaFile(testFile);
    console.log('Verification result:', verification);
}

testSampleDownload().catch(console.error);
