const axios = require('axios');

async function dumpScriptSrcs() {
    const embedUrl = 'https://nextgencloudfabric.com/embed/movie/1339713';
    const res = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://streamimdb.ru/'
        }
    });

    const srcs = res.data.match(/<script[^>]+src=["']([^"']+)["']/gi);
    console.log('Script srcs:', srcs);
}

dumpScriptSrcs();
