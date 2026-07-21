const { fetchTmdbById } = require('../src/Utils/movie_scraper');

async function testTvYear() {
    const res = await fetchTmdbById(1399, 'tv');
    console.log('Game of Thrones Seasons:', res.seasons.map(s => ({ season: s.season_number, air_date: s.air_date })));
    
    // Find latest season year
    const validSeasons = res.seasons.filter(s => s.season_number > 0 && s.air_date);
    if (validSeasons.length > 0) {
        const latestSeason = validSeasons.reduce((latest, s) => s.season_number > latest.season_number ? s : latest, validSeasons[0]);
        console.log('Latest Season:', latestSeason);
        console.log('Latest Season Year:', latestSeason.air_date.split('-')[0]);
    }
}

testTvYear();
