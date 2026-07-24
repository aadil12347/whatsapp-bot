const axios = require('axios');
const { searchStreamImdb } = require('../src/Utils/streamimdb_scraper');

async function performSmartSearch(query) {
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    
    async function searchTmdb(q) {
        const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${TMDB_KEY}`;
        try {
            const res = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });
            if (res.data && res.data.results) {
                return res.data.results
                    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
                    .slice(0, 8)
                    .map(r => ({
                        tmdbId: r.id,
                        type: r.media_type,
                        title: r.title || r.name || 'Unknown',
                        year: (r.release_date || r.first_air_date || '').substring(0, 4),
                        poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                        overview: r.overview || '',
                        href: r.media_type === 'movie'
                            ? `https://streamimdb.ru/movie/${r.id}`
                            : `https://streamimdb.ru/tv/${r.id}`,
                        embedMasterUrl: r.media_type === 'movie'
                            ? `https://embedmaster.link/movie/${r.id}`
                            : `https://embedmaster.link/tv/${r.id}`
                    }));
            }
        } catch (e) {
            console.error('TMDB Search error:', e.message);
        }
        return [];
    }

    // 1. Try exact query
    let results = await searchTmdb(query);
    let fallbackQueryUsed = null;

    // 2. If 0 results, try StreamIMDB fallback search
    if (results.length === 0) {
        console.log(`[StreamIMDB] TMDB search for "${query}" returned empty, trying StreamIMDB fallback...`);
        const fallbackResults = await searchStreamImdb(query);
        if (fallbackResults && fallbackResults.length > 0) {
            results = fallbackResults.map(r => ({
                tmdbId: r.href.match(/\d+/)?.[0] || '0',
                type: r.type || 'movie',
                title: r.title,
                year: r.year || '',
                poster: r.poster || '',
                overview: '',
                href: r.href,
                embedMasterUrl: `https://embedmaster.link/movie/${r.title}`
            }));
        }
    }

    // 3. Smart query reformulations if still 0 results
    if (results.length === 0) {
        // Build candidate alternative queries
        const stopWords = new Set(['i', 'a', 'an', 'the', 'that', 'this', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'of', 'by', 'my', 'your', 'it']);
        const words = query.split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean);
        
        const candidateQueries = [];

        // Candidate A: Filter stop words if query has > 2 words
        const nonStopWords = words.filter(w => !stopWords.has(w.toLowerCase()));
        if (nonStopWords.length > 0 && nonStopWords.length < words.length) {
            candidateQueries.push(nonStopWords.join(' '));
        }

        // Candidate B: Take the longest/most significant words
        if (words.length >= 3) {
            // e.g. first word + last word or longest words
            const sortedByLength = [...words].sort((a, b) => b.length - a.length);
            if (sortedByLength[0].length >= 4) {
                candidateQueries.push(sortedByLength.slice(0, 2).join(' '));
            }
        }

        for (const altQ of candidateQueries) {
            if (!altQ || altQ.trim() === query.trim()) continue;
            console.log(`[SmartSearch] Trying fallback query: "${altQ}"...`);
            let altResults = await searchTmdb(altQ);
            if (altResults.length === 0) {
                const streamAlt = await searchStreamImdb(altQ);
                if (streamAlt && streamAlt.length > 0) {
                    altResults = streamAlt.map(r => ({
                        tmdbId: r.href.match(/\d+/)?.[0] || '0',
                        type: r.type || 'movie',
                        title: r.title,
                        year: r.year || '',
                        poster: r.poster || '',
                        overview: '',
                        href: r.href,
                        embedMasterUrl: `https://embedmaster.link/movie/${r.title}`
                    }));
                }
            }
            if (altResults.length > 0) {
                results = altResults;
                fallbackQueryUsed = altQ;
                break;
            }
        }
    }

    return { results, fallbackQueryUsed };
}

async function run() {
    const res = await performSmartSearch('the house i built');
    console.log('Results count:', res.results.length);
    console.log('Fallback query used:', res.fallbackQueryUsed);
    console.log('Top results:', res.results.slice(0, 5));
}

run().catch(console.error);
