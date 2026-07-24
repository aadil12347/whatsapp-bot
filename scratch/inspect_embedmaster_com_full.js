const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

async function inspectEmbedmasterCom() {
    const res = await axios.get('https://embedmaster.com/', { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    console.log('--- Documentation / Code snippets / Examples on EmbedMaster.com ---');
    $('pre, code, table, .example, .api-format, p, h2, h3, a').each((i, el) => {
        const txt = $(el).text().trim();
        if (txt.includes('embed') || txt.includes('http') || txt.includes('movie') || txt.includes('tv') || txt.includes('iframe') || txt.includes('src=')) {
            if (txt.length < 300) {
                console.log(`${el.tagName}: ${txt}`);
            }
        }
    });
}

inspectEmbedmasterCom().catch(console.error);
