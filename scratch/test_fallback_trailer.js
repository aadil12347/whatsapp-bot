const axios = require('axios');
const yts = require('yt-search');

const TMDB_API_KEY = 'fc6d85b3839330e3458701b975195487';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

async function fetchTrailerWithFallback(tmdbId, mediaType = 'movie', title = '', seasonNumber = null) {
    try {
        let ytVideos = [];

        // 1. Try Season-level videos first if season specified
        if (mediaType === 'tv' && seasonNumber !== null) {
            try {
                const sUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/videos?api_key=${TMDB_API_KEY}`;
                const sRes = await axios.get(sUrl, { headers: HEADERS, timeout: 5000 });
                if (sRes.data && sRes.data.results) {
                    ytVideos.push(...sRes.data.results.filter(v => v.site === 'YouTube' && v.key));
                }
            } catch (_) {}
        }

        // 2. Try Series/Movie-level videos
        try {
            const mUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
            const mRes = await axios.get(mUrl, { headers: HEADERS, timeout: 5000 });
            if (mRes.data && mRes.data.results) {
                ytVideos.push(...mRes.data.results.filter(v => v.site === 'YouTube' && v.key));
            }
        } catch (_) {}

        if (ytVideos.length > 0) {
            let chosen = ytVideos.find(v => v.type === 'Trailer' && v.official);
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Trailer');
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Teaser' && v.official);
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Teaser');
            if (!chosen) chosen = ytVideos[0];

            if (chosen) {
                console.log(`[TMDB Video Match] Found ${chosen.type} (${chosen.name}): https://www.youtube.com/watch?v=${chosen.key}`);
                return `https://www.youtube.com/watch?v=${chosen.key}`;
            }
        }

        // 3. Fallback to YouTube Search if TMDB has no video
        if (title) {
            const query = `${title} ${mediaType === 'tv' && seasonNumber ? 'Season ' + seasonNumber : ''} official trailer`.trim();
            console.log(`[YouTube Search Fallback] Querying: "${query}"...`);
            const searchRes = await yts(query);
            if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
                const top = searchRes.videos[0];
                console.log(`[YouTube Search Match] ${top.title} (${top.url})`);
                return top.url;
            }
        }

        return null;
    } catch(e) {
        console.error("Trailer fetch error:", e.message);
        return null;
    }
}

async function main() {
    console.log("=== Dark Desire S1 ===");
    await fetchTrailerWithFallback(105214, 'tv', 'Dark Desire', 1);

    console.log("\n=== Game of Thrones S1 ===");
    await fetchTrailerWithFallback(1399, 'tv', 'Game of Thrones', 1);

    console.log("\n=== Fight Club ===");
    await fetchTrailerWithFallback(550, 'movie', 'Fight Club');
}

main();
