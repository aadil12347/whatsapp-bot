const axios = require('axios');

async function searchBuildStreamCode() {
    const url = 'https://nextgencloudfabric.com/embed/assets/js/player.min.js';
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://nextgencloudfabric.com/'
        }
    });

    const text = res.data;
    const idx = text.indexOf('buildStreamApiUrl');
    if (idx !== -1) {
        console.log(text.substring(idx - 100, idx + 1000));
    }
}

searchBuildStreamCode();
