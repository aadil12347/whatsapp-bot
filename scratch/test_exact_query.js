const axios = require('axios');
const { searchStreamImdb } = require('../src/Utils/streamimdb_scraper');

async function testQuery(query) {
    console.log(`=== Testing query: "${query}" ===`);
    
    // 1. TMDB Multi-search
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${TMDB_KEY}`;
    try {
        const tmdbRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        console.log('TMDB raw results count:', tmdbRes.data?.results?.length);
        const filtered = (tmdbRes.data?.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
        console.log('TMDB filtered movies/tv:', filtered.map(r => ({ id: r.id, type: r.media_type, title: r.title || r.name })));
    } catch (e) {
        console.error('TMDB error:', e.message);
    }

    // 2. StreamIMDB html search
    try {
        console.log('\n--- StreamIMDB fallback search ---');
        const results = await searchStreamImdb(query);
        console.log('StreamIMDB results:', results);
    } catch (e) {
        console.error('StreamIMDB search error:', e.message);
    }
}

async function run() {
    await testQuery('the house i built');
    await testQuery('the house that jack built');
    await testQuery('the house');
}

run().catch(console.error);
