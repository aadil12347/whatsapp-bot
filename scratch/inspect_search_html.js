const axios = require('axios');
const cheerio = require('cheerio');

async function inspectSearchHtml(url) {
    console.log(`\n========================================`);
    console.log(`Inspecting HTML for: ${url}`);
    console.log(`========================================`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            timeout: 15000
        });

        const $ = cheerio.load(res.data);
        console.log('Title:', $('title').text().trim());

        // Print all h1, h2, h3 tags
        console.log('Headings:');
        $('h1, h2, h3').slice(0, 10).each((i, el) => {
            console.log(`  H${el.name}:`, $(el).text().trim().substring(0, 80));
        });

        // Print all links
        console.log('\nSample Links (first 15):');
        $('a[href]').slice(0, 15).each((i, el) => {
            console.log(`  [${$(el).text().trim().substring(0, 50)}] -> ${$(el).attr('href')}`);
        });

        // Check if there are script tags containing hits, search, or JSON
        console.log('\nScript tags summary:');
        $('script').each((i, el) => {
            const html = $(el).html() || '';
            const src = $(el).attr('src') || '';
            if (src) {
                console.log(`  Script src: ${src}`);
            }
            if (html.includes('search') || html.includes('hits') || html.includes('Typesense') || html.includes('post_title') || html.includes('json') || html.includes('api')) {
                console.log(`  Script [${i}] snippet:`, html.substring(0, 200).replace(/\s+/g, ' '));
            }
        });

    } catch (err) {
        console.error('Failed to fetch:', err.message);
    }
}

async function run() {
    await inspectSearchHtml('https://new1.vegamovies.futbol/search.html?q=batman');
    await inspectSearchHtml('https://new1.rogmovies.click/search.html?q=pyaar&page=1');
}

run();
