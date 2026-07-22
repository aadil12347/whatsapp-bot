const { searchStreamImdb, getMediaDetails, resolveStreamOptions, downloadStreamWithFFmpeg, verifyMediaFile } = require('../src/Utils/streamimdb_scraper');
const path = require('path');
const fs = require('fs');

async function testFullFlow() {
    console.log('1. Searching for "Obsession"...');
    const results = await searchStreamImdb('Obsession');
    console.log(`Found ${results.length} results.`);
    const first = results[0];
    console.log('Selected:', first.title, first.href);

    console.log('\n2. Getting details...');
    const details = await getMediaDetails(first.href);
    console.log('Embed URL:', details.embedUrl);

    console.log('\n3. Resolving stream options...');
    const qualities = await resolveStreamOptions(details.embedUrl);
    console.log('Resolved qualities count:', qualities.length);
    console.log('Qualities:', qualities);

    if (qualities.length > 0) {
        console.log('\n4. Testing FFmpeg stream download on first quality...');
        const tempPath = path.join(__dirname, 'test_obsession_full.mp4');
        await downloadStreamWithFFmpeg(qualities[0].streamUrl, tempPath);
        
        console.log('\n5. Verifying media file...');
        const verification = await verifyMediaFile(tempPath);
        console.log('Verification:', verification);

        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
    }
}

testFullFlow().catch(console.error);
