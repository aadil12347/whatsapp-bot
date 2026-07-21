const axios = require('axios');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function decodeHubcdnDirect(url) {
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
        const html = res.data;
        const matches = html.match(/r=(aHR0cHM[A-Za-z0-9%_-]+)/g);
        if (matches) {
            for (const m of matches) {
                const b64 = m.replace('r=', '');
                try {
                    const decoded = Buffer.from(b64, 'base64').toString('utf8');
                    if (decoded.includes('link=')) {
                        let direct = decoded.split('link=')[1];
                        if (direct.includes('&')) direct = direct.split('&')[0];
                        return decodeURIComponent(direct);
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error("Decode failed for", url, ":", e.message);
    }
    return null;
}

async function testAllTriggerEpisodes() {
    const epUrls = [
        'https://hubcdn.sbs/file/kamfA957oSYKhAH4gSnJOF78L', // E01
        'https://hubcdn.sbs/file/DcdDLZWTxitBydpMCyOe3W2PY', // E02
        'https://hubcdn.sbs/file/ofylCLaxvrnh2nX2UIDIvJEGm', // E03
        'https://hubcdn.sbs/file/Y4nU5tHW35qGk8kxadsjYJRTf', // E04
        'https://hubcdn.sbs/file/UVAu5IHVO3Bp9h9oWPgz8m0r4', // E05
        'https://hubcdn.sbs/file/3MVvRe78bW2WNDTAhgNr8WMzW', // E06
        'https://hubcdn.sbs/file/uKCN6rIk8Jb0e6KKlzjQiGbtD', // E07
        'https://hubcdn.sbs/file/lXjU2eWgLgwGskmQOJeOmpMWZ', // E08
        'https://hubcdn.sbs/file/HcEdVrXBqxpVJ9GxaCc1vxrPV', // E09
        'https://hubcdn.sbs/file/Oi6Keh9jbUgRE7mX3H3GpfMzS'  // E10
    ];

    console.log("Testing Instant Decoding for All 10 Episodes of Trigger (720p)...\n");
    for (let i = 0; i < epUrls.length; i++) {
        const epNum = String(i + 1).padStart(2, '0');
        process.stdout.write(`Fetching Episode E${epNum}... `);
        const directUrl = await decodeHubcdnDirect(epUrls[i]);
        if (directUrl) {
            console.log(`✅ Success!\n   Direct URL: ${directUrl.substring(0, 100)}...`);
        } else {
            console.log(`❌ Failed`);
        }
    }
}

testAllTriggerEpisodes();
