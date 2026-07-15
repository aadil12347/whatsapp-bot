const scraper = require('../src/Utils/movie_scraper');

async function testSeries() {
    const url = 'https://vegamovies.navy/download-the-boys-2024-season-4-hindi-english-480p-720p-1080p-2160p-web-dl/';
    console.log(`Scraping TV Series post page: ${url}\n`);
    try {
        const links = await scraper.scrapeAllPostLinks(url);
        console.log(`Total links parsed: ${links.length}\n`);

        const validLinks = links.filter(l => {
            const lowerHref = l.href.toLowerCase();
            return lowerHref.includes('nexdrive') || 
                   lowerHref.includes('vgmlink') || 
                   lowerHref.includes('gdflix') || 
                   lowerHref.includes('fastdl') || 
                   lowerHref.includes('filebee') || 
                   lowerHref.includes('hubcloud') || 
                   lowerHref.includes('vcloud');
        });

        console.log(`Filtered redirect links (${validLinks.length}):`);
        validLinks.forEach((l, idx) => {
            console.log(`Option ${idx + 1}:`);
            console.log(`  Heading: "${l.heading}"`);
            console.log(`  Text:    "${l.text}"`);
            console.log(`  Res:     "${l.resolution}"`);
            console.log(`  Href:    ${l.href}`);
        });

    } catch (e) {
        console.error('Failed to scrape series post:', e.message);
    }
}

testSeries();
