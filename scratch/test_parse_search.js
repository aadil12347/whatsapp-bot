const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function searchSite(siteName, baseUrl, query) {
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    try {
        const res = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            },
            httpsAgent: browserHttpsAgent,
            timeout: 10000
        });

        const $ = cheerio.load(res.data);
        const results = [];

        $('article, .post-item, h2.entry-title, .entry-title').each((_, el) => {
            const a = $(el).is('a') ? $(el) : $(el).find('a[href]').first();
            if (a.length) {
                const href = a.attr('href');
                const title = a.text().trim() || $(el).text().trim();
                if (href && title && !href.includes('/category/') && !href.includes('/tag/') && !results.some(r => r.link === href)) {
                    results.push({ site: siteName, title, link: href });
                }
            }
        });

        console.log(`✅ ${siteName} (${baseUrl}) found ${results.length} result(s):`);
        results.forEach(r => console.log(`   - [${r.site}] ${r.title}\n     Link: ${r.link}`));
        return results;
    } catch (err) {
        console.error(`❌ ${siteName} (${baseUrl}) failed:`, err.message);
        return [];
    }
}

async function main() {
    await searchSite('Vegamovies', 'https://vegamovies.pages.dev', 'Superman');
    await searchSite('Rogmovies', 'https://rogmovies.pages.dev', 'Superman');
}

main();
