const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function testHubcloud() {
    const url = 'https://gpdl2.hubcloud.cx/?id=e179bc56976571ec10923695f1709514e2168bdd1cd78f88c59dc1db2b3a7063263497f559541c282855ab70c9d52ea0eb5a33626c005408f8889a90d733267cbed4a606ca17c500b4863edf2d82d93efb618125ec8f90ae51b949274ac913b9b57a48fe38fd163664abeccd719daf10::53d228966c6e65b4f5d49f9dbc36d4a2';
    console.log(`Testing GET on ${url}`);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://vcloud.fit/',
        'Origin': 'https://vcloud.fit'
    };

    try {
        const res = await axios.get(url, {
            headers,
            httpsAgent: browserHttpsAgent,
            timeout: 15000
        });

        console.log(`Status: ${res.status}`);
        console.log(`Data length: ${res.data.length}`);
        console.log(`HTML Snippet:`, res.data.substring(0, 500));

        const $ = cheerio.load(res.data);
        console.log(`Scripts found: ${$('script').length}`);
        $('script').each((i, el) => {
            const txt = $(el).text();
            if (txt.includes('atob') || txt.includes('url') || txt.includes('reurl') || txt.includes('location')) {
                console.log(`Script ${i}:`, txt);
            }
        });

        $('a').each((i, el) => {
            console.log(`Link ${i}: ${$(el).text().trim()} -> ${$(el).attr('href')}`);
        });

    } catch (err) {
        console.error(`Error:`, err.message);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error(`Headers:`, err.response.headers);
            console.error(`Data snippet:`, String(err.response.data).substring(0, 300));
        }
    }
}

testHubcloud();
