const axios = require('axios');

async function testFetchImdbId() {
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    const tmdbId = '398173'; // The House That Jack Built

    console.log(`Fetching IMDb ID for TMDB Movie ${tmdbId}...`);
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${TMDB_KEY}`;
    const res = await axios.get(url);

    console.log('External IDs:', res.data);
    console.log('IMDb ID:', res.data.imdb_id);
}

testFetchImdbId().catch(console.error);
