const { fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function inspectSpiderman() {
    const url = 'https://nexdrive.fit/genxfm784776499633/';
    console.log(`\n========================================`);
    console.log(`Inspecting Nexdrive Spider-Man Page: ${url}`);
    console.log(`========================================`);

    try {
        const html = await fetchHtmlWithRetry(url);
        const $ = cheerio.load(html);
        console.log('Title:', $('title').text().trim());

        console.log('\nAll <a> tags on nexdrive page:');
        $('a[href]').each((i, el) => {
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            const href = $(el).attr('href');
            console.log(`  [${i + 1}] Text: "${text}" -> ${href}`);
        });

    } catch (e) {
        console.error('Fetch failed:', e.message);
    }
}

inspectSpiderman();
