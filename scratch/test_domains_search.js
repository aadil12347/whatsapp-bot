const axios = require('axios');
const cheerio = require('cheerio');

(async () => {
    console.log('--- Testing Vegamovies ---');
    try {
        const v1 = await axios.get('https://new2.vegamovies.futbol/search.php?q=Superman&page=1', {
            headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
        });
        console.log('Vegamovies /search.php status:', v1.status, 'hits:', v1.data?.hits?.length);
    } catch (e) { console.log('Vegamovies /search.php err:', e.message); }

    try {
        const v2 = await axios.get('https://new2.vegamovies.futbol/?s=Superman', {
            headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
        });
        const $ = cheerio.load(v2.data);
        console.log('Vegamovies HTML search articles:', $('article, .post-item, .entry-title').length);
    } catch (e) { console.log('Vegamovies HTML err:', e.message); }

    console.log('\n--- Testing Rogmovies ---');
    try {
        const r1 = await axios.get('https://new2.rogmovies.click/search.php?q=Superman&page=1', {
            headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
        });
        console.log('Rogmovies /search.php status:', r1.status, 'hits:', r1.data?.hits?.length);
    } catch (e) { console.log('Rogmovies /search.php err:', e.message); }

    try {
        const r2 = await axios.get('https://new2.rogmovies.click/?s=Superman', {
            headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
        });
        const $ = cheerio.load(r2.data);
        console.log('Rogmovies HTML search articles:', $('article, .post-item, .entry-title').length);
    } catch (e) { console.log('Rogmovies HTML err:', e.message); }
})();
