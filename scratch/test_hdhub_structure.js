const axios = require('axios');
const cheerio = require('cheerio');

async function testHdhub() {
    try {
        const res = await axios.get('https://new3.hdhub4u.cl', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        console.log('HDHub Title:', $('title').text());
        
        $('ul.recent-movies li, figure, .thumb, div.figure, div.item').each((i, el) => {
            const link = $(el).find('a').first();
            const href = link.attr('href');
            const img = $(el).find('img').first();
            const src = img.attr('data-src') || img.attr('src');
            const title = $(el).find('figcaption, h2, h3, .title, p').text().trim() || link.attr('title') || img.attr('alt');
            if (href && title) {
                console.log(`[HDHub ${i+1}] Title: "${title.substring(0, 50)}" | Link: ${href} | Img: ${src}`);
            }
        });
        
        // Also test all <a> with img
        $('a').each((i, el) => {
            const img = $(el).find('img').first();
            if (img.length > 0) {
                const href = $(el).attr('href');
                const alt = img.attr('alt') || $(el).text().trim();
                const src = img.attr('data-src') || img.attr('src');
                if (href && href.length > 5 && !href.includes('/category/')) {
                    console.log(`[HDHub Link ${i}] Text/Alt: "${alt.substring(0, 50)}" | Href: ${href} | Img: ${src}`);
                }
            }
        });
    } catch (e) {
        console.error('HDHub error:', e.message);
    }
}
testHdhub();
