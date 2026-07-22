const axios = require('axios');

async function inspectPlayerJs() {
    const url = 'https://nextgencloudfabric.com/embed/assets/js/player.min.js';
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://nextgencloudfabric.com/'
        }
    });

    console.log('player.min.js length:', res.data.length);
    
    // Look for API endpoints, post, fetch, or ajax in player.min.js
    const urls = res.data.match(/https?:\/\/[^\s"'`()]+/gi) || [];
    console.log('URLs in player.min.js:', [...new Set(urls)].slice(0, 20));

    const apis = res.data.match(/[\w/.-]+\.php[^\s"'`()]*/gi) || [];
    console.log('PHP endpoints in player.min.js:', [...new Set(apis)]);
}

inspectPlayerJs();
