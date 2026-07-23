const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const imdbId = 'tt4003440';
    console.log(`Fetching https://embedmaster.link/movie/${imdbId}...`);
    const res = await axios.get(`https://embedmaster.link/movie/${imdbId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://embedmaster.link/'
        }
    });

    const $ = cheerio.load(res.data);
    $('form').each((i, el) => {
        console.log(`\n--- Form ${i} ---`);
        console.log('Action:', $(el).attr('action'));
        console.log('Method:', $(el).attr('method'));
        console.log('Inputs:', $(el).find('input').map((_, input) => ({
            name: $(input).attr('name'),
            type: $(input).attr('type'),
            value: $(input).attr('value')
        })).get());
    });
}

test().catch(console.error);
