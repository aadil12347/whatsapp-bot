const { searchStreamImdb, getMediaDetails, resolveStreamOptions } = require('../src/Utils/streamimdb_scraper');

async function test() {
    console.log('Searching for The House That Jack Built...');
    const results = await searchStreamImdb('The House That Jack Built');
    console.log('Results:', results);
    if (results.length > 0) {
        const details = await getMediaDetails(results[0].href);
        console.log('Details embedUrl:', details.embedUrl);
        const options = await resolveStreamOptions(details.embedUrl);
        console.log('Stream options resolved:', JSON.stringify(options, null, 2));
    }
}

test().catch(console.error);
