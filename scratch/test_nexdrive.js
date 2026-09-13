const { fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = 'https://nexdrive.fit/genxfm7847768608/';
        console.log('Fetching:', url);
        const html = await fetchHtmlWithRetry(url);
        const $ = cheerio.load(html);
        console.log('Title:', $('title').text());
        console.log('All links found:');
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            const parent = $(el).parent().text().trim();
            console.log(`[${i}] Text: "${text}" | Parent: "${parent.substring(0, 60)}" | Href: "${href}"`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
