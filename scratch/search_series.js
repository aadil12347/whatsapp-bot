const axios = require('axios');

async function search() {
    const VEGAMOVIES_DOMAIN = 'https://vegamovies.navy';
    const query = 'Boys';
    const url = `${VEGAMOVIES_DOMAIN}/search.php?q=${encodeURIComponent(query)}&page=1`;
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': VEGAMOVIES_DOMAIN + '/'
            }
        });
        console.log('Hits:');
        res.data.hits.forEach(h => {
            console.log(`Title: ${h.document.post_title} -> URL: ${h.document.permalink}`);
        });
    } catch(e) {
        console.error(e);
    }
}
search();
