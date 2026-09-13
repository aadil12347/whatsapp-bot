const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function test() {
    const url = 'https://new2.vegamovies.futbol/download-peaky-blinders-season-1-6-hindi-org-480p-720p-1080p-bluray/';
    console.log('Scraping multi-season post:', url);
    const links = await scrapeAllPostLinks(url);
    console.log(`Found ${links.length} total links:`);
    links.forEach((l, i) => {
        console.log(`[${i}] Text: "${l.text}" | Res: ${l.resolution} | isPack: ${l.isPack} | Heading: "${l.heading}" | ParentText: "${(l.parentText||'').substring(0, 60)}" | Href: ${l.href}`);
    });

    const targetSeason = 5;
    const seasonLinks = links.filter(l => {
        const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
        const sMatch = text.match(/season\s*(\d+)|\bs(\d+)\b/i);
        if (sMatch) {
            return parseInt(sMatch[1] || sMatch[2], 10) === targetSeason;
        }
        return false;
    });

    console.log(`\nFiltered links for Season ${targetSeason}: ${seasonLinks.length}`);
    seasonLinks.forEach((l, i) => {
        console.log(`[${i}] Text: "${l.text}" | Res: ${l.resolution} | Heading: "${l.heading}" | Href: ${l.href}`);
    });
}

test();
