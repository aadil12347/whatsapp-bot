const axios = require('axios');

async function searchPlayerJs() {
    const url = 'https://nextgencloudfabric.com/embed/assets/js/player.min.js';
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://nextgencloudfabric.com/'
        }
    });

    const text = res.data;

    // Search for references to CONFIG or sourceApiUrl
    const matches = [];
    const keywords = ['sourceApiUrl', 'streamDataApiUrl', 'playToken', 'source-api', 'api.php'];

    keywords.forEach(kw => {
        let idx = 0;
        while ((idx = text.indexOf(kw, idx)) !== -1) {
            const start = Math.max(0, idx - 100);
            const end = Math.min(text.length, idx + 200);
            console.log(`=== Keyword: ${kw} @ ${idx} ===`);
            console.log(text.substring(start, end));
            console.log('-----------------------------------');
            idx += kw.length;
        }
    });
}

searchPlayerJs();
