const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function testHdhub4uScrape() {
    const url = 'https://new3.hdhub4u.cl/trigger-season-1-webrip-hindi-full-series/';
    console.log(`Scraping all post links for ${url}...`);
    try {
        const links = await scrapeAllPostLinks(url);
        console.log(`Total links scraped: ${links.length}`);
        links.forEach((l, i) => {
            console.log(`[${i+1}] ${l.episode || 'NO-EP'} (${l.resolution}) - Text: "${l.text}" -> ${l.href}`);
        });
    } catch(e) {
        console.error('Error:', e.message);
    }
}

testHdhub4uScrape();
