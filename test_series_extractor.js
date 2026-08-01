const { extractSeriesVcloudLinks } = require('./src/Utils/movie_scraper');

async function testSeriesExtractor() {
    const testNextdriveUrl = process.argv[2] || 'https://nexdrive.fit/genxfm784776495266/';
    console.log(`\n==================================================`);
    console.log(`🚀 Testing Series VCloud Extractor for: ${testNextdriveUrl}`);
    console.log(`==================================================\n`);

    const startTime = Date.now();
    try {
        const result = await extractSeriesVcloudLinks(testNextdriveUrl, {
            concurrency: 2,
            timeoutMs: 20000
        });

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ Finished extraction in ${elapsedSec} seconds!`);
        console.log(`📌 Page Title: ${result.title}`);
        console.log(`📌 Total VCloud Episode Links Found: ${result.totalFound}`);
        console.log(`📌 Successfully Resolved Episodes: ${result.resolvedCount}`);

        console.log(`\n==================================================`);
        console.log(`📱 WHATSAPP COPYABLE MESSAGE OUTPUT:`);
        console.log(`==================================================\n`);
        console.log(result.whatsappMessage);
        console.log(`\n==================================================\n`);
    } catch (err) {
        console.error(`❌ Series extraction test failed:`, err.message);
    }
}

testSeriesExtractor();
