const { fetchHtmlWithRetry, resolveVcloudLink } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function testVcloudThor() {
    const vcloudUrl = 'https://vcloud.fit/otypwllzzteppsz';
    console.log(`\n========================================`);
    console.log(`Fetching Thor VCloud page via FlareSolverr: ${vcloudUrl}`);
    console.log(`========================================`);

    try {
        const html = await fetchHtmlWithRetry(vcloudUrl);
        const $ = cheerio.load(html);
        console.log('Title:', $('title').text().trim());

        console.log('\nAll <a> tags on page:');
        $('a[href]').each((i, el) => {
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            const href = $(el).attr('href');
            const id = $(el).attr('id');
            const cls = $(el).attr('class');
            console.log(`  [${i + 1}] ID="${id}" Class="${cls}" Text="${text}" -> ${href}`);
        });

        console.log('\nTesting resolveVcloudLink(vcloudUrl)...');
        const res = await resolveVcloudLink(vcloudUrl);
        console.log('resolveVcloudLink result:', res);
    } catch (err) {
        console.error('Failed:', err.message);
    }
}

testVcloudThor();
