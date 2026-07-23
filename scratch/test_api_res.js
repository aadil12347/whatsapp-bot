const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const embedUrl = "https://streamimdb.ru/embed/movie/398173";
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://streamimdb.ru/'
    };

    const res1 = await axios.get(embedUrl, { headers: HEADERS, timeout: 15000 });
    const $1 = cheerio.load(res1.data);
    let nextgenUrl = $1('#pf').attr('src') || '';

    const res2 = await axios.get(nextgenUrl, {
        headers: { ...HEADERS, 'Referer': embedUrl },
        timeout: 15000
    });

    const configMatch = res2.data.match(/const CONFIG = ({[\s\S]*?});/);
    const config = JSON.parse(configMatch[1]);
    console.log('CONFIG:', config);

    let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'tmdb'}=${config.mediaId}&type=${config.mediaType || 'movie'}&token=${config.playToken}&tokenTs=${config.playTokenTs}`;

    const apiRes = await axios.get(apiUrl, {
        headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Referer': nextgenUrl,
            'Origin': new URL(nextgenUrl).origin
        },
        timeout: 15000
    });

    console.log('Full StreamData API Response:', JSON.stringify(apiRes.data, null, 2));
}

test().catch(console.error);
