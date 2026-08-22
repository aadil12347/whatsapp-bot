const axios = require('axios');

async function testSearch(siteName, domain, apiPath, query) {
    const url = `${domain}${apiPath}?q=${encodeURIComponent(query)}&page=1`;
    console.log(`\n========================================`);
    console.log(`Testing ${siteName}: ${url}`);
    console.log(`========================================`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': domain + '/'
            },
            timeout: 15000
        });

        console.log(`Status: ${res.status}`);
        console.log(`Data Type: ${typeof res.data}`);
        if (typeof res.data === 'object') {
            console.log(`Hits count: ${res.data.hits ? res.data.hits.length : 'NO HITS FIELD'}`);
            if (res.data.hits && res.data.hits.length > 0) {
                console.log(`First result sample:`);
                console.log(JSON.stringify(res.data.hits[0], null, 2));
            } else {
                console.log(`Keys in response data:`, Object.keys(res.data));
                console.log(`Raw response preview:`, JSON.stringify(res.data).substring(0, 500));
            }
        } else {
            console.log(`Response HTML snippet: ${String(res.data).substring(0, 300)}`);
        }
    } catch (err) {
        console.error(`Error testing ${siteName}:`, err.message);
        if (err.response) {
            console.error(`Response status: ${err.response.status}`);
            console.error(`Response data snippet:`, String(err.response.data).substring(0, 300));
        }
    }
}

async function run() {
    // 1. VegaMovies on new domain
    await testSearch('VegaMovies (/search.php)', 'https://new2.vegamovies.futbol', '/search.php', 'batman');
    await testSearch('VegaMovies (/ts-search.php)', 'https://new2.vegamovies.futbol', '/ts-search.php', 'batman');
    
    // 2. RogMovies on new domain
    await testSearch('RogMovies (/ts-search.php)', 'https://new2.rogmovies.click', '/ts-search.php', 'pyaar');
    await testSearch('RogMovies (/search.php)', 'https://new2.rogmovies.click', '/search.php', 'pyaar');
}

run();
