const { fetchHtmlWithRetry, resolveVcloudLink } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function testSpidermanVcloud() {
    const vcloudUrl = 'https://vcloud.fit/j_arnejeraexou3';
    console.log(`\n========================================`);
    console.log(`Testing Spider-Man VCloud page via FlareSolverr: ${vcloudUrl}`);
    console.log(`========================================`);

    try {
        const html = await fetchHtmlWithRetry(vcloudUrl);
        const $ = cheerio.load(html);
        console.log('Page Title:', $('title').text().trim());

        console.log('\nScripts on vcloud page:');
        $('script').each((i, el) => {
            const code = $(el).html() || '';
            if (code.includes('atob') || code.includes('var url')) {
                console.log(`Script [${i}]:`, code.substring(0, 300));
            }
        });

        console.log('\nResolving via resolveVcloudLink...');
        const res = await resolveVcloudLink(vcloudUrl);
        console.log('resolveVcloudLink result:', res);

    } catch (e) {
        console.error('Failed:', e.message);
    }
}

testSpidermanVcloud();
