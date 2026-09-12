const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');

(async () => {
    console.log('Testing Unified Search for Non-Indian (Superman)...');
    const res1 = await searchMoviesAndSeries('Superman', 'non-indian');
    console.log('Non-Indian results count:', res1.length);
    if (res1.length > 0) {
        console.log('First candidate:', res1[0]);
    }

    console.log('\nTesting Unified Search for Indian (Stree 2)...');
    const res2 = await searchMoviesAndSeries('Stree 2', 'indian');
    console.log('Indian results count:', res2.length);
    if (res2.length > 0) {
        console.log('First candidate:', res2[0]);
    }
})();
