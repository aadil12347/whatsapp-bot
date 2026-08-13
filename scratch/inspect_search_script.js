const axios = require('axios');
const cheerio = require('cheerio');

async function printFullScript(siteName, url) {
    console.log(`\n========================================`);
    console.log(`Full Script [0] for ${siteName}: ${url}`);
    console.log(`========================================`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(res.data);
        const script0 = $('script').first().html();
        console.log(script0);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

async function run() {
    await printFullScript('Vegamovies', 'https://new1.vegamovies.futbol/search.html?q=batman');
    await printFullScript('Rogmovies', 'https://new1.rogmovies.click/search.html?q=pyaar&page=1');
}

run();
