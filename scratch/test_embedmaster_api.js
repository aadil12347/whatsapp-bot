const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const imdbId = 'tt4003440';
    const tmdbId = '398173';

    console.log('Testing EmbedMaster & multi-provider embed resolver...');

    const providers = [
        `https://embedmaster.link/movie/${imdbId}`,
        `https://embedmaster.link/movie/${tmdbId}`,
        `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
        `https://vidsrc.me/embed/movie?imdb=${imdbId}`,
        `https://autoembed.cc/embed/movie/${tmdbId}`,
        `https://2embed.cc/embed/movie/${tmdbId}`
    ];

    for (let url of providers) {
        console.log(`\n========================================`);
        console.log(`Fetching: ${url}`);
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://google.com'
                },
                timeout: 10000
            });

            console.log(`Status: ${res.status}`);
            const $ = cheerio.load(res.data);
            const title = $('title').text().trim();
            console.log(`Page Title: ${title}`);

            const iframes = $('iframe').map((i, el) => $(el).attr('src')).get();
            if (iframes.length) console.log('Iframes:', iframes);

            // Search for m3u8, mp4, or stream sources in inline scripts
            const scripts = $('script').map((i, el) => $(el).html()).get();
            let matches = [];
            scripts.forEach(s => {
                if (!s) return;
                const m = s.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/gi);
                if (m) matches.push(...m);
            });
            if (matches.length) {
                console.log('Direct Stream Links found:', matches);
            }
        } catch (err) {
            console.error(`Failed ${url}: ${err.message}`);
        }
    }
}

test().catch(console.error);
