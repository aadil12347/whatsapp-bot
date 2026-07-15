const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://vcloud.zip/'
};

async function test() {
    const url = 'https://hub.latent.click/12ea9906758c65ce2b8be852d469394c?token=1784141266';
    try {
        console.log('Fetching:', url);
        const res = await axios.get(url, { headers: HEADERS, timeout: 5000 });
        console.log('Success, length:', res.data.length);
        const $ = cheerio.load(res.data);
        console.log('Title:', $('title').text());
        console.log('Scripts containing atob or var url:');
        $('script').each((i, el) => {
            const text = $(el).text();
            if (text.includes('atob') || text.includes('url')) {
                console.log(`Script ${i}:`, text.substring(0, 500));
            }
        });
        
        // Let's check for any download buttons
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const txt = $(el).text().trim();
            if (href && (href.includes('download') || txt.toLowerCase().includes('download'))) {
                console.log(`Link: "${txt}" -> "${href}"`);
            }
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
