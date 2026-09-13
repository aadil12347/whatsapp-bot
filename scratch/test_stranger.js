const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function test() {
    try {
        const url = 'https://new2.vegamovies.futbol/download-stranger-things-season-1-dual-audio-hindi-org-audio/';
        console.log('Scraping:', url);
        const links = await scrapeAllPostLinks(url);
        console.log(`Found ${links.length} total links:`);
        links.forEach((l, i) => {
            console.log(`[${i}] Text: "${l.text}" | Res: ${l.resolution} | isPack: ${l.isPack} | Heading: "${l.heading}" | Href: ${l.href}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
