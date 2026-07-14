const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

async function test() {
    const url = 'https://nexdrive.fit/genxfm784776495918/';
    console.log('Fetching:', url);
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        console.log('Status:', res.status);
        const $ = cheerio.load(res.data);
        console.log('Page Title:', $('title').text());
        
        console.log('All links containing vcloud or hubcloud or gdflix:');
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href) {
                console.log(`Link text: "${text}", href: "${href}"`);
            }
        });
        
        console.log('Page scripts count:', $('script').length);
    } catch (e) {
        console.error('Error fetching:', e.message);
    }
}

test();
