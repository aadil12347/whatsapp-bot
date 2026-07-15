const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
};

async function test() {
    const url = 'https://hub.latent.click/12ea9906758c65ce2b8be852d469394c?token=1784141266';
    try {
        console.log('Fetching:', url);
        const res = await axios.get(url, { headers: HEADERS, timeout: 15000, maxRedirects: 5, validateStatus: () => true });
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
        const $ = cheerio.load(res.data);
        console.log('--- HTML ---');
        console.log($('body').html().substring(0, 1000));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
