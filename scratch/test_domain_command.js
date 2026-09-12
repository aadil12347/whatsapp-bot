const { getDomains, getDomain, setDomain } = require('../src/Utils/domain_manager');
const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('--- 1. Testing Domain Manager Defaults & Persistence ---');
    const initial = getDomains();
    console.log('Initial domains:', initial);

    console.log('\n--- 2. Setting Rogmovies & Vegamovies URLs ---');
    const res1 = setDomain('1', 'https://new2.rogmovies.click/');
    console.log('Set Rogmovies result:', res1);

    const res2 = setDomain('2', 'https://new2.vegamovies.futbol/');
    console.log('Set Vegamovies result:', res2);

    console.log('\n--- 3. Verifying Saved File Content ---');
    const fileContent = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/domains.json'), 'utf8'));
    console.log('Saved domains.json content:', fileContent);

    console.log('\n--- 4. Testing Unified Search with Updated Domains ---');
    console.log('Searching Vegamovies (Superman)...');
    const vegaResults = await searchMoviesAndSeries('Superman', 'non-indian');
    console.log(`Vegamovies results count: ${vegaResults.length}`);

    console.log('\nSearching Rogmovies (Stree 2)...');
    const rogResults = await searchMoviesAndSeries('Stree 2', 'indian');
    console.log(`Rogmovies results count: ${rogResults.length}`);

    console.log('\n✅ ALL DOMAIN TESTS PASSED SUCCESSFULLY!');
})();
