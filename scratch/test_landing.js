const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
};

async function test() {
    const url = 'https://nexdrive.fit/genxfm784776393879/';
    try {
        console.log('Fetching:', url);
        const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);
        
        console.log('--- ALL LINKS ---');
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            console.log(`Text: "${text}" | Href: "${href}"`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
