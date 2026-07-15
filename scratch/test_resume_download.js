const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function downloadFileWithResume(url, tempFilePath, customHeaders = {}, abortSignal = null) {
    const parsedUrl = new URL(url);
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': parsedUrl.origin + '/',
        'Origin': parsedUrl.origin
    };
    const headers = { ...defaultHeaders, ...customHeaders };

    let downloadedBytes = 0;
    let totalBytes = 0;
    let attempts = 0;
    const maxAttempts = 3;

    if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
    }

    while (attempts < maxAttempts) {
        attempts++;
        let writer = null;
        try {
            const requestHeaders = { ...headers };
            if (downloadedBytes > 0) {
                requestHeaders['Range'] = `bytes=${downloadedBytes}-`;
                writer = fs.createWriteStream(tempFilePath, { flags: 'a' });
                console.log(`[DanieDownload] Attempt ${attempts}: Resuming download from byte ${downloadedBytes}`);
            } else {
                writer = fs.createWriteStream(tempFilePath);
                console.log(`[DanieDownload] Attempt ${attempts}: Starting download`);
            }

            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: requestHeaders,
                timeout: 300000
            });

            if (downloadedBytes === 0) {
                totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            }

            const status = response.status;
            if (downloadedBytes > 0 && status !== 206) {
                console.log(`[DanieDownload] Server returned status ${status} instead of 206. Restarting download.`);
                writer.end();
                fs.unlinkSync(tempFilePath);
                writer = fs.createWriteStream(tempFilePath);
                downloadedBytes = 0;
            }

            response.data.pipe(writer);

            let streamError = null;
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', (err) => {
                    streamError = err;
                    reject(err);
                });
                response.data.on('error', (err) => {
                    streamError = err;
                    reject(err);
                });
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    
                    // Simulate an interruption halfway through the download on the first attempt
                    if (attempts === 1 && downloadedBytes > 10 * 1024 * 1024) {
                        console.log('[Test] Simulating stream interruption!');
                        response.data.destroy(new Error('Simulated Connection Reset'));
                    }
                });
            });

            if (!streamError) {
                console.log(`[DanieDownload] Download completed. Total bytes: ${downloadedBytes}`);
                break;
            }
        } catch (err) {
            console.error(`[DanieDownload] Attempt ${attempts} failed:`, err.message);
            if (writer) writer.destroy();

            if (attempts >= maxAttempts) {
                throw new Error(`Download failed after ${maxAttempts} attempts. Error: ${err.message}`);
            }
            
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function run() {
    const url = 'https://pub-f4ba9fb2017042968ec12c06f4b42344.r2.dev/0abe1a8b374cc7c409bb58cde9115936?token=1784131846110';
    const dest = path.join(__dirname, 'test_resumed_file.mkv');
    try {
        await downloadFileWithResume(url, dest);
        console.log('Final verified file size:', fs.statSync(dest).size);
        fs.unlinkSync(dest);
    } catch(e) {
        console.error('Final test failure:', e.message);
    }
}

run();
