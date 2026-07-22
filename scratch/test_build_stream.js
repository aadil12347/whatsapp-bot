const axios = require('axios');

async function testVaplayerApi() {
    const tmdbId = '157336'; // Interstellar
    const apiUrl = `https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}`;

    console.log('Fetching:', apiUrl);
    try {
        const res = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://nextgencloudfabric.com/'
            }
        });
        console.log('Response status:', res.status);
        console.log('Response data:', JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error('Error:', e.response ? e.response.data : e.message);
    }
}

testVaplayerApi();
