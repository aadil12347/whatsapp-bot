const axios = require('axios');
const cheerio = require('cheerio');

async function testVegaRog(url, name) {
    console.log(`\n=================== ${name} (${url}) ===================`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            maxRedirects: 5,
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        console.log('Page Title:', $('title').text().trim());

        // Test selectors for Vega/Rog
        const postCardSelectors = [
            'div.post-cards article',
            'div.recent-post article',
            'div.blog-cards article',
            'main div.post',
            'div.post',
            'article'
        ];

        for (const sel of postCardSelectors) {
            const els = $(sel);
            if (els.length > 0) {
                console.log(`\nSelector "${sel}" matched ${els.length} elements!`);
                els.slice(0, 3).each((i, el) => {
                    const link = $(el).find('a[href]').first();
                    const href = link.attr('href');
                    const img = $(el).find('img').first();
                    const imgSrc = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
                    const titleText = $(el).find('h2, h3, .entry-title, .title').text().trim() || link.attr('title') || img.attr('alt');
                    console.log(`[${i+1}] Title: "${titleText}" | Href: ${href} | Img: ${imgSrc}`);
                });
                break;
            }
        }
    } catch (e) {
        console.error(`Error ${name}:`, e.message);
    }
}

async function run() {
    await testVegaRog('https://vegamovies.catering', 'VegaMovies Catering');
    await testVegaRog('https://rogmovies.rest', 'RogMovies Rest');
}
run();
