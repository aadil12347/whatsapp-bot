const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

const domains = [
    'https://vegamovies.im',
    'https://vegamovies.ph',
    'https://vegamovies.to',
    'https://vegamovies.nl',
    'https://vegamovies.cat',
    'https://rogmovies.vip',
    'https://rogmovies.fun',
    'https://rogmovies.com',
    'https://rogmovies.in',
    'https://hdhub4u.be',
    'https://hdhub4u.store',
    'https://hdhub4u.tv'
];

async function check(url) {
    try {
        const fullUrl = `${url}/?s=Superman`;
        const res = await axios.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            httpsAgent: browserHttpsAgent,
            timeout: 6000,
            maxRedirects: 5
        });
        const $ = cheerio.load(res.data);
        const title = $('title').text().trim();
        const aCount = $('a[href*="download"], a[href*="movie"], article a, .post-title a, h2 a').length;
        console.log(`[STATUS ${res.status}] ${url} -> Title: "${title}" | Links: ${aCount}`);
    } catch (err) {
        console.log(`[FAIL] ${url} -> ${err.message}`);
    }
}

async function main() {
    for (const d of domains) {
        await check(d);
    }
}

main();
