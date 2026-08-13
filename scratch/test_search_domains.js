const axios = require('axios');
const cheerio = require('cheerio');

async function testSearch(siteName, searchUrl) {
    console.log(`\n========================================`);
    console.log(`Testing ${siteName} Search: ${searchUrl}`);
    console.log(`========================================`);

    try {
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 15000
        });

        console.log(`Status: ${res.status}`);
        console.log(`Content-Type: ${res.headers['content-type']}`);
        
        const isJson = typeof res.data === 'object' || (typeof res.data === 'string' && res.data.trim().startsWith('{'));
        if (isJson) {
            const json = typeof res.data === 'object' ? res.data : JSON.parse(res.data);
            console.log('Response is JSON! Hits count:', json.hits ? json.hits.length : 0);
            if (json.hits && json.hits.length > 0) {
                console.log('Sample hit 1:', json.hits[0]);
            }
        } else {
            console.log('Response is HTML! Parsing HTML...');
            const $ = cheerio.load(res.data);
            const posts = [];
            $('article.post, article.post-cards, div.post-cards article, div.blog-items article, .entry-title a, article header h2 a').each((_, el) => {
                const a = $(el).is('a') ? $(el) : $(el).find('a').first();
                const href = a.attr('href');
                const title = a.text().trim() || a.attr('title');
                const img = $(el).find('img').first();
                const thumb = img.attr('src') || img.attr('data-src') || null;

                if (href && title && !posts.some(p => p.permalink === href)) {
                    posts.push({ title, permalink: href, thumbnail: thumb });
                }
            });
            console.log(`Found ${posts.length} posts via HTML selector!`);
            if (posts.length > 0) {
                console.log('Sample post 1:', posts[0]);
            }
        }
    } catch (err) {
        console.error(`Fetch failed for ${siteName}:`, err.message);
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
        }
    }
}

async function runTests() {
    await testSearch('Vegamovies (Batman)', 'https://new1.vegamovies.futbol/search.html?q=batman');
    await testSearch('Vegamovies (Batman Arise Page 1)', 'https://new1.vegamovies.futbol/search.html?q=batman%20arise&page=1');
    await testSearch('Rogmovies (Pyaar Page 1)', 'https://new1.rogmovies.click/search.html?q=pyaar&page=1');
    await testSearch('Rogmovies (Honeymoon)', 'https://new1.rogmovies.click/search.html?q=honeymoon+par');
}

runTests();
