const { resolveStreamOptions } = require('../src/Utils/streamimdb_scraper');

async function testFilter() {
    console.log('Resolving streams for Obsession...');
    const options = await resolveStreamOptions('https://streamimdb.ru/embed/movie/1339713');
    console.log('Filtered valid options:', options);
}

testFilter().catch(console.error);
