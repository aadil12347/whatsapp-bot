const { fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function testSearch(siteName, baseUrl, query) {
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    console.log(`🔍 Searching ${siteName}: ${searchUrl}`);
    try {
        const html = await fetchHtmlWithRetry(searchUrl);
        const $ = cheerio.load(html);
        const posts = [];
        
        $('article, .post-item, .entry-title, h2.entry-title').each((_, el) => {
            const linkEl = $(el).find('a[href]').first().length ? $(el).find('a[href]').first() : $(el).is('a') ? $(el) : null;
            if (linkEl && linkEl.length) {
                const href = linkEl.attr('href');
                const title = linkEl.text().trim() || $(el).text().trim();
                if (href && title && !href.includes('/category/') && !href.includes('/tag/') && !posts.some(p => p.link === href)) {
                    posts.push({ site: siteName, title, link: href });
                }
            }
        });

        console.log(`✅ ${siteName} returned ${posts.length} result(s):`);
        posts.slice(0, 3).forEach(p => console.log(`   - ${p.title} -> ${p.link}`));
        return posts;
    } catch (err) {
        console.error(`❌ ${siteName} search failed:`, err.message);
        return [];
    }
}

async function main() {
    await testSearch('Vegamovies', 'https://vegamovies.im', 'Superman 2025');
    await testSearch('Rogmovies', 'https://rogmovies.net', 'Superman 2025');
}

main();
