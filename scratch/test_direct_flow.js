const EventEmitter = require('events');
const fs = require('fs');

// Read danie_download.js and extract/test streamImdbSearchHandler directly
const { searchStreamImdb } = require('../src/Utils/streamimdb_scraper');

async function testDirectHandler() {
    console.log('Testing .si command directly with query "the house i built"...');
    
    // Create mock reply
    const reply = async (txt) => {
        console.log('\n--- [BOT REPLY] ---');
        console.log(txt);
        console.log('-------------------\n');
    };

    const mek = {
        key: {
            remoteJid: '17064693616661@lid',
            participant: '923013068663:42@s.whatsapp.net',
            fromMe: true
        },
        message: {
            extendedTextMessage: {
                text: '.si the house i built'
            }
        }
    };

    // We can simulate what happens inside streamImdbSearchHandler
    const query = 'the house i built';
    console.log(`[DanieWatch] Command detected: "si" args: "${query}"`);

    // Run the actual TMDB + Fallback flow
    const axios = require('axios');
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    
    async function searchTmdbApi(q) {
        const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${TMDB_KEY}`;
        try {
            const searchRes = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });
            if (searchRes.data && searchRes.data.results) {
                return searchRes.data.results
                    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
                    .slice(0, 8)
                    .map(r => ({
                        tmdbId: r.id,
                        type: r.media_type,
                        title: r.title || r.name || 'Unknown',
                        year: (r.release_date || r.first_air_date || '').substring(0, 4),
                        poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                        overview: r.overview || ''
                    }));
            }
        } catch (e) {}
        return [];
    }

    function generateFallbackQueries(q) {
        const stopWords = new Set(['i', 'a', 'an', 'the', 'that', 'this', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'of', 'by', 'my', 'your', 'it', 'is', 'was']);
        const cleaned = q.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const words = cleaned.split(' ').filter(Boolean);
        const candidates = [];

        const nonStop = words.filter(w => !stopWords.has(w.toLowerCase()));
        if (nonStop.length > 0 && nonStop.length < words.length) {
            candidates.push(nonStop.join(' '));
        }

        if (words.length >= 3) {
            const sortedByLength = [...words].sort((a, b) => b.length - a.length);
            const topWords = sortedByLength.slice(0, 2).join(' ');
            if (topWords && !candidates.includes(topWords) && topWords !== q) {
                candidates.push(topWords);
            }
        }
        return candidates;
    }

    let results = await searchTmdbApi(query);
    let fallbackQueryUsed = null;

    if (results.length === 0) {
        console.log(`[StreamIMDB] TMDB search for "${query}" returned empty, trying StreamIMDB fallback...`);
        const fallbackResults = await searchStreamImdb(query);
        if (fallbackResults && fallbackResults.length > 0) {
            results = fallbackResults;
        }
    }

    if (results.length === 0) {
        const fallbackCandidates = generateFallbackQueries(query);
        for (const altQ of fallbackCandidates) {
            console.log(`[StreamIMDB] Trying smart fallback query: "${altQ}"...`);
            let altResults = await searchTmdbApi(altQ);
            if (altResults.length === 0) {
                const streamAlt = await searchStreamImdb(altQ);
                if (streamAlt && streamAlt.length > 0) {
                    altResults = streamAlt;
                }
            }
            if (altResults.length > 0) {
                results = altResults;
                fallbackQueryUsed = altQ;
                break;
            }
        }
    }

    let responseText = `🎬 *IMDb / EmbedMaster Results for "${query}":*\n`;
    if (fallbackQueryUsed) {
        responseText += `ℹ️ _(Showing closest matches for "${fallbackQueryUsed}")_\n`;
    }
    responseText += `\n`;
    results.forEach((r, idx) => {
        const typeLabel = r.type === 'tv' ? '📺 TV Series' : '🎥 Movie';
        const yearLabel = r.year ? `(${r.year})` : '';
        responseText += `  \`${idx + 1}\` — *${r.title}* ${yearLabel} [${typeLabel}]\n`;
    });
    responseText += `\n_Reply with a number (1-${results.length}) to select and load poster image & download options._`;

    await reply(responseText);
}

testDirectHandler().catch(console.error);
