const axios = require('axios');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function testWpJson(siteName, baseUrl, query) {
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=5`;
    console.log(`🔍 Testing WordPress JSON API for ${siteName}: ${apiUrl}`);
    try {
        const res = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            httpsAgent: browserHttpsAgent,
            timeout: 10000
        });

        if (Array.isArray(res.data) && res.data.length > 0) {
            console.log(`✅ ${siteName} WP API returned ${res.data.length} post(s):`);
            res.data.forEach(p => console.log(`   - Title: ${p.title?.rendered || p.slug}\n     Link: ${p.link}`));
            return res.data.map(p => ({ site: siteName, title: p.title?.rendered, link: p.link }));
        } else {
            console.log(`⚠️ ${siteName} WP API returned 0 posts or non-array.`);
            return [];
        }
    } catch (err) {
        console.error(`❌ ${siteName} WP API failed:`, err.response?.status || err.message);
        return [];
    }
}

async function main() {
    await testWpJson('Vegamovies', 'https://vegamovies.pages.dev', 'Superman');
    await testWpJson('Vegamovies IM', 'https://vegamovies.im', 'Superman');
    await testWpJson('HDHub4u', 'https://hdhub4u.tv', 'Superman');
}

main();
