const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function inspectVcloudFit() {
    const url = 'https://vcloud.fit/5gy6ff6qqbrq-kr';
    console.log(`Inspecting ${url}`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            httpsAgent: browserHttpsAgent,
            timeout: 15000
        });

        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        console.log(`Title: ${$('title').text()}`);

        $('a').each((i, el) => {
            console.log(`Link ${i}: [${$(el).text().trim()}] -> ${$(el).attr('href')}`);
        });

        // Check if there are form posts, timers, or JS redirects
        $('script').each((i, el) => {
            const txt = $(el).text();
            if (txt.includes('location') || txt.includes('href') || txt.includes('token') || txt.includes('fetch') || txt.includes('form')) {
                console.log(`Script ${i}:`, txt.trim());
            }
        });

    } catch (err) {
        console.error(`Error:`, err.message);
    }
}

inspectVcloudFit();
