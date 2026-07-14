const scraper = require('../src/Utils/movie_scraper');

async function testTvFormatting() {
    const tmdbId = 1399; // Game of Thrones
    const mediaType = 'tv';
    const tmdbUrl = 'https://www.themoviedb.org/tv/1399';
    
    console.log('Fetching Game of Thrones TMDB ID 1399...');
    const tmdb = await scraper.fetchTmdbById(tmdbId, mediaType);
    if (!tmdb) {
        console.error('Failed to fetch TMDB details.');
        return;
    }
    
    console.log('Fetched details successfully. Generating caption...');

    let seasonText = '';
    let episodeText = '';
    if (mediaType === 'tv') {
        const seasonMatch = tmdbUrl.match(/\/season\/(\d+)/i);
        const specifiedSeason = seasonMatch ? parseInt(seasonMatch[1], 10) : null;

        if (specifiedSeason !== null) {
            const targetSeason = tmdb.seasons.find(s => s.season_number === specifiedSeason);
            const epCount = targetSeason ? targetSeason.episode_count : 0;
            const sLabel = `S${String(specifiedSeason).padStart(2, '0')}`;
            seasonText = `📺 *Season:* *${sLabel}*\n`;
            episodeText = `🔢 *Episodes:* *E01 - E${String(epCount).padStart(2, '0')}*\n`;
            
            if (targetSeason && targetSeason.overview) {
                tmdb.overview = targetSeason.overview;
            }
        } else {
            const validSeasons = tmdb.seasons.filter(s => s.season_number > 0);
            if (validSeasons.length > 0) {
                const minSeason = Math.min(...validSeasons.map(s => s.season_number));
                const maxSeason = Math.max(...validSeasons.map(s => s.season_number));
                const minLabel = `S${String(minSeason).padStart(2, '0')}`;
                const maxLabel = `S${String(maxSeason).padStart(2, '0')}`;
                
                if (minSeason === maxSeason) {
                    seasonText = `📺 *Season:* *${minLabel}*\n`;
                } else {
                    seasonText = `📺 *Season:* *${minLabel} - ${maxLabel}*\n`;
                }
                
                episodeText = `🔢 *Episodes:*\n`;
                validSeasons.forEach(s => {
                    const epCount = s.episode_count;
                    episodeText += `   • Season ${s.season_number}: *E01 - E${String(epCount).padStart(2, '0')}*\n`;
                });
            }
        }
    }

    let detailsMessage = `🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 🍿\n`;
    detailsMessage += `───────────────────\n`;
    detailsMessage += `📝 *Title:* *${tmdb.title}*\n`;
    detailsMessage += `📅 *Year:* *${tmdb.year}*\n`;
    if (seasonText) detailsMessage += seasonText;
    detailsMessage += `🎭 *Genre:* *${tmdb.genres}*\n`;
    if (episodeText) detailsMessage += episodeText;
    detailsMessage += `───────────────────\n`;
    detailsMessage += `*『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』*`;

    console.log('\n--- FORMATTED CAPTION ---');
    console.log(detailsMessage);
    console.log('-------------------------\n');
}

testTvFormatting();
