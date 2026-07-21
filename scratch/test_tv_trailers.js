const axios = require('axios');

const TMDB_API_KEY = 'fc6d85b3839330e3458701b975195487';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

async function testTvTrailers(tmdbId, seasonNumber = null) {
    console.log(`\nTesting TV ID ${tmdbId} (Season ${seasonNumber || 'all'})...`);
    
    // 1. Series level videos
    const mainUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
    try {
        const res = await axios.get(mainUrl, { headers: HEADERS });
        console.log(`Series level videos count: ${res.data.results ? res.data.results.length : 0}`);
        if (res.data.results) {
            res.data.results.forEach(v => console.log(`  - [${v.type}] ${v.name} (site: ${v.site}, official: ${v.official}, key: ${v.key})`));
        }
    } catch(e) {
        console.error(`Series level fetch error: ${e.message}`);
    }

    // 2. Season level videos (if season specified)
    if (seasonNumber !== null) {
        const seasonUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/videos?api_key=${TMDB_API_KEY}`;
        try {
            const seasonRes = await axios.get(seasonUrl, { headers: HEADERS });
            console.log(`Season ${seasonNumber} level videos count: ${seasonRes.data.results ? seasonRes.data.results.length : 0}`);
            if (seasonRes.data.results) {
                seasonRes.data.results.forEach(v => console.log(`  - [${v.type}] ${v.name} (site: ${v.site}, official: ${v.official}, key: ${v.key})`));
            }
        } catch(e) {
            console.error(`Season level fetch error: ${e.message}`);
        }
    }
}

async function main() {
    await testTvTrailers(105214, 1); // Dark Desire
    await testTvTrailers(1399, 1);   // Game of Thrones
    await testTvTrailers(76479, 1);  // The Boys
}

main();
