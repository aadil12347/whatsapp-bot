const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const imdbId = 'tt4003440'; // The House That Jack Built
    const tmdbId = '398173';
    
    console.log(`1. Testing EmbedMaster movie URL: https://embedmaster.link/movie/${imdbId}`);
    try {
        const res = await axios.get(`https://embedmaster.link/movie/${imdbId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://embedmaster.link/'
            },
            timeout: 15000
        });
        console.log('EmbedMaster HTML status:', res.status);
        console.log('EmbedMaster HTML sample (first 1500 chars):\n', res.data.substring(0, 1500));

        const $ = cheerio.load(res.data);
        const iframes = $('iframe').map((i, el) => $(el).attr('src')).get();
        console.log('Iframes found:', iframes);

        const scripts = $('script').map((i, el) => $(el).html()).get();
        console.log(`Scripts found: ${scripts.length}`);
        scripts.forEach((s, idx) => {
            if (s && (s.includes('m3u8') || s.includes('eval') || s.includes('sources') || s.includes('file') || s.includes('CONFIG') || s.includes('player'))) {
                console.log(`\nScript ${idx} containing media refs:\n`, s.substring(0, 1000));
            }
        });
    } catch (err) {
        console.error('Error fetching EmbedMaster:', err.message);
    }
}

test().catch(console.error);
