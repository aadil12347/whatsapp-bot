const axios = require('axios');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function decodeHubcdnInstant(url) {
    try {
        const res = await axios.get(url, { headers: HEADERS });
        const html = res.data;
        const match = html.match(/var\s+reurl\s*=\s*['"]([^'"]+)['"]/);
        if (match && match[1]) {
            const u = new URL(match[1]);
            const rVal = u.searchParams.get('r');
            if (rVal) {
                const decoded = Buffer.from(rVal, 'base64').toString('utf8');
                if (decoded.includes('link=')) {
                    let directLink = decoded.split('link=')[1];
                    if (directLink.includes('&')) directLink = directLink.split('&')[0];
                    return decodeURIComponent(directLink);
                }
                return decoded;
            }
        }
    } catch (e) {
        console.error("Decode error:", e.message);
    }
    return null;
}

async function main() {
    const testUrls = [
        'https://hubcdn.sbs/file/kamfA957oSYKhAH4gSnJOF78L', // Ep 1 (720p)
        'https://hubcdn.sbs/file/DcdDLZWTxitBydpMCyOe3W2PY', // Ep 2 (720p)
        'https://hubcdn.sbs/file/ofylCLaxvrnh2nX2UIDIvJEGm', // Ep 3 (720p)
        'https://hubcdn.sbs/file/Y4nU5tHW35qGk8kxadsjYJRTf'  // Ep 4 (720p)
    ];

    for (let i = 0; i < testUrls.length; i++) {
        console.log(`Decoding Episode ${i+1}...`);
        const directUrl = await decodeHubcdnInstant(testUrls[i]);
        console.log(` -> Direct Link: ${directUrl}\n`);
    }
}

main();
