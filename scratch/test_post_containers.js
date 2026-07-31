const axios = require('axios');
const cheerio = require('cheerio');

async function inspectContainers(url, name) {
    console.log(`\n=================== ${name} (${url}) ===================`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        console.log('Title:', $('title').text().trim());
        
        // Test primary post containers
        const mainSelectors = [
            '#content .post-cards',
            '#primary article',
            '.recent-movies article',
            '.post-cards article',
            '#main article',
            'div.recent-movies > div',
            '.blog-cards article',
            'main article',
            'article'
        ];
        
        for (const sel of mainSelectors) {
            const els = $(sel);
            if (els.length > 0) {
                console.log(`Selector "${sel}" matched ${els.length} elements!`);
                els.slice(0, 3).each((i, el) => {
                    const title = $(el).find('h2, h3, .entry-title, a[title], img[alt]').first().text().trim() || $(el).find('img').first().attr('alt');
                    const link = $(el).find('a[href]').first().attr('href');
                    console.log(`   [${i+1}] Title: "${title}" | Link: ${link}`);
                });
            }
        }
    } catch (e) {
        console.error(`Failed ${name}:`, e.message);
    }
}

async function run() {
    await inspectContainers('https://vegamovies.navy', 'VegaMovies');
    await inspectContainers('https://rogmovies.rest', 'RogMovies');
    await inspectContainers('https://new3.hdhub4u.cl', 'HDHub4u');
}
run();
