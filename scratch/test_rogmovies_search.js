const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
    const queries = ['stree', 'pushpa', 'batman', 'superman'];
    for (const q of queries) {
        console.log(`\n=== Query: ${q} ===`);
        try {
            const res1 = await axios.get(`https://new2.rogmovies.click/search.php?q=${encodeURIComponent(q)}&page=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000
            });
            console.log(`search.php hits:`, res1.data?.hits?.length || (typeof res1.data === 'object' ? JSON.stringify(res1.data).slice(0, 100) : 'not obj'));
        } catch(e) { console.log('search.php err:', e.message); }

        try {
            const res2 = await axios.get(`https://new2.rogmovies.click/ts-search.php?q=${encodeURIComponent(q)}&page=1`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000
            });
            console.log(`ts-search.php hits:`, res2.data?.hits?.length || (typeof res2.data === 'object' ? JSON.stringify(res2.data).slice(0, 100) : 'not obj'));
        } catch(e) { console.log('ts-search.php err:', e.message); }
    }
})();
