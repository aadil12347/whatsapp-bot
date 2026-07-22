const { searchStreamImdb, getMediaDetails, resolveStreamOptions } = require('../src/Utils/streamimdb_scraper');

async function test() {
    console.log('--- Testing Movie Search ---');
    const movieResults = await searchStreamImdb('Interstellar');
    console.log('Movie search results:', movieResults.slice(0, 3));

    if (movieResults.length > 0) {
        console.log('\n--- Testing Movie Details ---');
        const details = await getMediaDetails(movieResults[0].href);
        console.log('Movie title:', details.title);
        console.log('Is TV:', details.isTv);
        console.log('Embed URL:', details.embedUrl);

        if (details.embedUrl) {
            const qualities = await resolveStreamOptions(details.embedUrl);
            console.log('Stream options:', qualities);
        }
    }

    console.log('\n--- Testing TV Series Search ---');
    const tvResults = await searchStreamImdb('Big Wolf on Campus');
    console.log('TV search results:', tvResults.slice(0, 3));

    if (tvResults.length > 0) {
        console.log('\n--- Testing TV Show Seasons/Episodes Details ---');
        const tvDetails = await getMediaDetails(tvResults[0].href);
        console.log('TV title:', tvDetails.title);
        console.log('Is TV:', tvDetails.isTv);
        console.log('Seasons count:', tvDetails.seasons ? tvDetails.seasons.length : 0);
        if (tvDetails.seasons && tvDetails.seasons.length > 0) {
            console.log('Season 1 episodes count:', tvDetails.seasons[0].episodes.length);
            console.log('First episode:', tvDetails.seasons[0].episodes[0]);
        }
    }
}

test().catch(console.error);
