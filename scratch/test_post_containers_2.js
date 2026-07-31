const axios = require('axios');
const cheerio = require('cheerio');

async function testSite(url, siteName) {
    console.log(`\n=================== ${siteName} (${url}) ===================`);
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
        console.log('Final URL:', res.request.res.responseUrl || url);
        console.log('Page Title:', $('title').text().trim());

        // Find main post container
        const postCardSelectors = [
            '#content .post-cards article',
            '.post-cards article',
            '#primary main article',
            'main article',
            'ul.recent-movies li',
            'figure',
            'article'
        ];

        for (const sel of postCardSelectors) {
            const els = $(sel);
            if (els.length > 0) {
                console.log(`\n--- Selector "${sel}" (${els.length} matches) ---`);
                els.slice(0, 4).each((i, el) => {
                    const link = $(el).find('a[href]').first();
                    const href = link.attr('href');
                    const img = $(el).find('img').first();
                    const imgSrc = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
                    const titleText = $(el).find('h2, h3, .entry-title, .title').text().trim() || link.attr('title') || img.attr('alt');
                    console.log(`[${i+1}] Title: "${titleText}"\n    Href: ${href}\n    Img:  ${imgSrc}`);
                });
            }
        }
    } catch (e) {
        console.error(`Error ${siteName}:`, e.message);
    }
}

async function run() {
    await testSite('https://vegamovies.catering', 'VegaMovies');
    await testSite('https://rogmovies.rest', 'RogMovies');
    await testSite('https://new3.hdhub4u.cl', 'HDHub4u');
}
run();
