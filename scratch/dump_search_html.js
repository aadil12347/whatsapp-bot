const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function dumpHTML(url) {
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        },
        httpsAgent: browserHttpsAgent
    });
    const $ = cheerio.load(res.data);
    console.log("TITLE:", $('title').text());
    console.log("H2 COUNT:", $('h2').length);
    $('h2, h3, .post-title, .entry-title, a[href*="download"]').each((i, el) => {
        if (i < 10) {
            console.log(`[${i}] <${el.name}> ${$(el).text().trim()} | href: ${$(el).attr('href') || $(el).find('a').attr('href')}`);
        }
    });
}

dumpHTML('https://vegamovies.me/?s=Superman');
