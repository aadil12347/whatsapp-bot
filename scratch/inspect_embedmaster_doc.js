const axios = require('axios');
const cheerio = require('cheerio');

async function inspectDoc() {
    const res = await axios.get('https://embedmaster.com/documentation/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    });
    console.log('Doc page length:', res.data.length);
    const $ = cheerio.load(res.data);

    console.log('\n=== Documentation text & code snippets ===');
    $('code, pre, blockquote, p, tr, td, h1, h2, h3, h4').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length < 500) {
            console.log(`[${el.tagName}]: ${text}`);
        }
    });
}

inspectDoc().catch(console.error);
