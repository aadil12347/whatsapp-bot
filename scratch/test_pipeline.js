const scraper = require('../src/Utils/movie_scraper');

async function testPipeline() {
    const url = 'https://vegamovies.navy/download-is-god-is-2026-hindi-dubbed-org-english-480p-720p-1080p-web-dl/';
    console.log('--- STARTING SERVER-SIDE EXTRACTION PIPELINE ---');
    console.log('Vegamovies Post URL:', url);
    try {
        // Step 1: Scrape post page for 720p link (nexdrive.fit)
        console.log('\n[Step 1] Scraping post page...');
        const scraped = await scraper.scrapePostPage(url);
        console.log('Result:', scraped);

        // Step 2: Resolve landing link (nexdrive -> vcloud/fastdl/filebee)
        console.log('\n[Step 2] Resolving landing page redirect...');
        const landingUrl = await scraper.resolveLandingLink(scraped.chosenUrl);
        console.log('Result:', landingUrl);

        // Step 3: Resolve V-Cloud / fastdl / filebee link to direct download
        console.log('\n[Step 3] Extracting direct download link...');
        let directUrl = landingUrl;
        if (landingUrl.includes('vcloud') || landingUrl.includes('hubcloud') || landingUrl.includes('gdflix') || landingUrl.includes('fastdl') || landingUrl.includes('filebee')) {
            directUrl = await scraper.resolveVcloudLink(landingUrl);
        }
        console.log('Result:', directUrl);
        
        console.log('\n--- PIPELINE COMPLETED SUCCESSFULLY ---');
        console.log('Direct URL resolved:', directUrl);
    } catch (e) {
        console.error('Pipeline failed:', e.message);
    }
}

testPipeline();
