const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');

async function test() {
    console.log('Testing searchMoviesAndSeries for "Peaky Blinders"...');
    const results = await searchMoviesAndSeries('Peaky Blinders', 'non-indian');
    console.log(`\nFound ${results.length} candidate post(s):`);
    results.forEach((r, i) => console.log(`[${i}] Site: ${r.site} | Title: "${r.title}" | Link: ${r.link}`));
}

test();
