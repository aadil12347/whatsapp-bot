const axios = require('axios');

const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3ecc2e92f23';

async function searchTmdb(query) {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`;
    const res = await axios.get(url, { timeout: 10000 });
    const results = res.data.results || [];
    
    return results.filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 8).map(r => ({
        id: r.id,
        type: r.media_type,
        title: r.title || r.name || 'Unknown',
        year: (r.release_date || r.first_air_date || '').substring(0, 4),
        poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
        overview: r.overview || ''
    }));
}

async function test() {
    console.log('Testing TMDB search for "The House That Jack Built"...');
    const items = await searchTmdb('The House That Jack Built');
    console.log('Search Results:', JSON.stringify(items, null, 2));
}

test().catch(console.error);
