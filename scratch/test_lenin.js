const { scrapeAllPostLinks, extractSubOptions, resolveVcloudLink } = require('../src/Utils/movie_scraper');

async function testLeninScrape() {
    const postUrl = 'https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/';
    console.log(`==================================================`);
    console.log(`Testing Extractor for RogMovies - Lenin (2026) Post:`);
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
                    for (const sub of subOptions) {
                        try {
                            console.log(`Resolving direct link for: ${sub.text}...`);
                            const res = await resolveVcloudLink(sub.href);
                            if (res && res.startsWith('http')) {
                                directUrl = res;
                                console.log(`SUCCESS with ${sub.text}: ${directUrl}`);
                                break;
                            }
                        } catch (subErr) {
                            console.warn(`Sub-option resolution failed (${sub.text}): ${subErr.message}`);
                        }
                    }
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

testLeninScrape();
