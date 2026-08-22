const { scrapeAllPostLinks, extractSubOptions, resolveVcloudLink, extractDirectDownloadLinks } = require('../src/Utils/movie_scraper');

async function testBackroomsScrape() {
    const postUrl = 'https://new2.vegamovies.futbol/download-backrooms-2026-hindi-org-english-480p-720p-1080p-web-dl/';
    console.log(`==================================================`);
    console.log(`Testing Extractor for Backrooms (2026) Post:`);
    console.log(`${postUrl}`);
    console.log(`==================================================\n`);

    try {
        const scrapedLinks = await scrapeAllPostLinks(postUrl);
        console.log(`📌 Total Link Options Found on Post Page: ${scrapedLinks.length}\n`);

        const results = [];

        for (let i = 0; i < scrapedLinks.length; i++) {
            const item = scrapedLinks[i];
            console.log(`--- Option #${i + 1} ---`);
            console.log(`Resolution : ${item.resolution}`);
            console.log(`Heading    : ${item.heading || 'N/A'}`);
            console.log(`Landing Href: ${item.href}`);

            let directUrl = null;
            let subOptions = [];

            try {
                subOptions = await extractSubOptions(item.href);
                console.log(`Sub-options count: ${subOptions.length}`);
                if (subOptions.length > 0) {
                    subOptions.forEach((so, idx) => console.log(`  [Sub #${idx + 1}] ${so.text} -> ${so.href}`));
                    const firstSub = subOptions[0].href;
                    console.log(`Resolving direct link for sub-option 1...`);
                    directUrl = await resolveVcloudLink(firstSub);
                } else {
                    console.log(`Resolving direct link directly from landing href...`);
                    directUrl = await resolveVcloudLink(item.href);
                }
            } catch (err) {
                console.error(`❌ Extraction error for option #${i + 1}:`, err.message);
            }

            console.log(`🎯 Direct Download URL: ${directUrl || 'FAILED'}\n`);

            results.push({
                option: i + 1,
                resolution: item.resolution,
                heading: item.heading,
                landingHref: item.href,
                subOptions,
                directDownloadUrl: directUrl
            });
        }

        console.log(`==================================================`);
        console.log(`SUMMARY OF EXTRACTED DIRECT DOWNLOAD LINKS:`);
        console.log(`==================================================`);
        results.forEach(r => {
            console.log(`[Option #${r.option}] ${r.resolution} | ${r.heading}`);
            console.log(`Direct Link: ${r.directDownloadUrl}\n`);
        });

    } catch (err) {
        console.error(`Scrape failed:`, err.message);
    }
}

testBackroomsScrape();
