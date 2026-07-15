const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fileType = require('file-type');

async function testRealDownload() {
    const url = 'https://pub-f4ba9fb2017042968ec12c06f4b42344.r2.dev/0abe1a8b374cc7c409bb58cde9115936?token=1784131846110';
    const targetFilename = 'Pritam.and.Pedro.S01E01.720p.JHS.WEB-DL.Hindi.DDP5.1.H.264.mp4';
    
    let tempFilename = targetFilename || ('file_' + Date.now());
    const tempFilePath = path.join(__dirname, 'tmp_' + Date.now() + '_' + tempFilename);
    console.log('Target temp file path:', tempFilePath);

    try {
        const parsedUrl = new URL(url);
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': parsedUrl.origin + '/',
                'Origin': parsedUrl.origin
            },
            timeout: 600000 // 10 minutes
        });

        console.log('Headers fetched. Content-Length:', response.headers['content-length']);

        const writer = fs.createWriteStream(tempFilePath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });

        console.log('Finished writing. File size on disk:', fs.statSync(tempFilePath).size);
        
        // Clean up
        fs.unlinkSync(tempFilePath);
        console.log('Success, temporary file deleted.');
    } catch (err) {
        console.error('Download/Write error:', err.message);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

testRealDownload();
