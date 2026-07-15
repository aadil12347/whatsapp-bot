const axios = require('axios');
const fs = require('fs');

async function testDownload() {
    const url = 'https://pub-f4ba9fb2017042968ec12c06f4b42344.r2.dev/0abe1a8b374cc7c409bb58cde9115936?token=1784131846110';
    console.log('Testing download of:', url);
    try {
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': new URL(url).origin + '/',
                'Origin': new URL(url).origin
            },
            timeout: 30000
        });
        console.log('Response Status:', response.status);
        console.log('Response Headers:', response.headers);
        response.data.on('data', (chunk) => {
            console.log('Received chunk of size:', chunk.length);
            response.data.destroy(); // stop after first chunk
        });
    } catch (err) {
        console.error('Error during download:', err.message);
        if (err.response) {
            console.error('Response status:', err.response.status);
            console.error('Response headers:', err.response.headers);
        }
    }
}

testDownload();
