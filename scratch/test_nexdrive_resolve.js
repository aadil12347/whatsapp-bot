const { extractSubOptions, extractDirectDownloadLinks, resolveVcloudLink } = require('../src/Utils/movie_scraper');

async function run() {
    const nexdriveUrl = 'https://nexdrive.fit/genxfm784776503639/';
    console.log(`Testing extraction for Rogmovies nexdrive URL: ${nexdriveUrl}`);
    
    try {
        console.log('\n--- Step 1: extractSubOptions ---');
        const subOpts = await extractSubOptions(nexdriveUrl);
        console.log(`subOpts count: ${subOpts.length}`);
        console.log(JSON.stringify(subOpts, null, 2));

        if (subOpts.length > 0) {
            const vcloudUrl = subOpts[0].href;
            console.log(`\n--- Step 2: resolveVcloudLink for ${vcloudUrl} ---`);
            const direct = await resolveVcloudLink(vcloudUrl);
            console.log(`Direct link: ${direct}`);
        }
    } catch (err) {
        console.error('Extraction error:', err.message);
    }
}

run();
