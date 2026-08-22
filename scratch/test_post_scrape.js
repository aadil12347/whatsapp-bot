const axios = require('axios');
const cheerio = require('cheerio');
const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function testScrape(siteName, domain, query) {
    console.log(`\n========================================`);
    console.log(`Testing search + post scrape for ${siteName}`);
    console.log(`========================================`);

    const apiPath = siteName === 'Rogmovies' ? '/ts-search.php' : '/search.php';
    const searchUrl = `${domain}${apiPath}?q=${encodeURIComponent(query)}&page=1`;

    try {
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': domain + '/'
            },
            timeout: 15000
        });

        const hits = res.data?.hits || [];
        console.log(`Search returned ${hits.length} hits.`);
        if (hits.length === 0) return;

        const first = hits[0].document;
        let postUrl = first.permalink;
        if (!postUrl.startsWith('http')) {
            postUrl = `${domain}${postUrl.startsWith('/') ? '' : '/'}${postUrl}`;
        }

        console.log(`First Post Title: ${first.post_title}`);
        console.log(`Post URL: ${postUrl}`);

        const links = await scrapeAllPostLinks(postUrl);
        console.log(`Scraped ${links.length} download links/resolutions from post.`);
        if (links.length > 0) {
            console.log(`First 3 links:`);
            console.log(JSON.stringify(links.slice(0, 3), null, 2));
        }
    } catch (err) {
        console.error(`Error for ${siteName}:`, err.message);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
        }
    }
}

async function run() {
    await testScrape('Vegamovies', 'https://new2.vegamovies.futbol', 'batman');
    await testScrape('Rogmovies', 'https://new2.rogmovies.click', 'pyaar');
}

run();
