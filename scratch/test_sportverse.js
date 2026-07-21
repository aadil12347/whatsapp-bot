const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function testSportverse(url) {
    console.log(`Fetching ${url}...`);
    try {
        const res = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(res.data);
        console.log(`Page title: "${$('title').text().trim()}"`);
        
        $('a[href]').each((_, el) => {
            const txt = $(el).text().trim();
            const href = $(el).attr('href');
            if (href) console.log(` - "${txt}" -> ${href}`);
        });
    } catch(e) {
        console.error("Error:", e.message);
    }
}

testSportverse('https://sportverse.cc/hubcloud.php?host=hubcloud&id=5vnw35io8bnlbvn&token=Y1NSbE5RVzRuWG5PTVBUWEw3MWRkbHhWYXNxRjJ6T0RPQ2ZhL2Y5a0NyYz0=');
