const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function inspectLeninVcloud() {
    const landingUrl = 'https://vcloud.fit/-12_g27fltaetqu';
    console.log(`Step 1: Fetching ${landingUrl}`);

    const res1 = await axios.get(landingUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
        httpsAgent: browserHttpsAgent
    });

    const $1 = cheerio.load(res1.data);
    let tokenUrl = null;
    $1('script').each((_, el) => {
        const txt = $1(el).text();
        const atobMatch = txt.match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
        if (atobMatch && atobMatch[1]) {
            try {
                const step1 = Buffer.from(atobMatch[1], 'base64').toString('utf8');
                tokenUrl = Buffer.from(step1, 'base64').toString('utf8');
            } catch (e) {}
        }
    });

    console.log(`Step 2: Decoded Token URL: ${tokenUrl}`);
    if (!tokenUrl) return;

    console.log(`Step 3: Fetching token page...`);
    const res2 = await axios.get(tokenUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Referer': landingUrl
        },
        httpsAgent: browserHttpsAgent
    });

    const $2 = cheerio.load(res2.data);
    console.log(`Title: ${$2('title').text()}`);

    $2('a').each((i, el) => {
        console.log(`Link ${i}: [${$2(el).text().trim()}] -> ${$2(el).attr('href')}`);
    });
}

inspectLeninVcloud();
