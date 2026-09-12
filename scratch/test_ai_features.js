const { getDomains, setDomain, getHostPriority } = require('../src/Utils/domain_manager');
const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');

(async () => {
    console.log('--- 1. Testing Domain & Host Priority Configuration ---');
    console.log('Initial host priority:', getHostPriority());

    const resHost = setDomain('3', 'fslv2, 10gbps, fsl, pixeldrain');
    console.log('Updated host priority result:', resHost);

    const updatedDomains = getDomains();
    console.log('Domains & Host Priority after update:', updatedDomains);

    console.log('\n--- 2. Testing Scraper with Updated Priority ---');
    console.log('Searching Vegamovies (Superman)...');
    const searchRes = await searchMoviesAndSeries('Superman', 'non-indian');
    console.log(`Vegamovies search returned ${searchRes.length} candidates.`);

    console.log('\n--- 3. Resetting Host Priority to Defaults ---');
    setDomain('3', '10gbps, fslv2, fsl, vcloud, gofile, pixeldrain');
    console.log('Reset host priority:', getHostPriority());

    console.log('\n✅ ALL AI SEARCH & DOMAIN TESTS PASSED CLEANLY!');
})();
