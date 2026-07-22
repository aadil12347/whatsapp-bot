const axios = require('axios');

async function testApi() {
    const embedUrl = 'https://nextgencloudfabric.com/embed/movie/1339713';
    const res = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://streamimdb.ru/'
        }
    });

    const configMatch = res.data.match(/const CONFIG = ({[\s\S]*?});/);
    if (!configMatch) {
        console.error('Config not found');
        return;
    }

    const config = JSON.parse(configMatch[1]);
    console.log('Parsed CONFIG:', config);

    // Test calling streamDataApiUrl
    try {
        const params = new URLSearchParams({
            mediaType: config.mediaType || 'movie',
            mediaId: config.mediaId,
            idType: config.idType || 'tmdb',
            token: config.playToken,
            tokenTs: config.playTokenTs,
            source: 'justhd'
        });
        if (config.season) params.append('season', config.season);
        if (config.episode) params.append('episode', config.episode);

        console.log('Requesting stream data:', `${config.streamDataApiUrl}?${params.toString()}`);
        const apiRes = await axios.get(`${config.streamDataApiUrl}?${params.toString()}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'Origin': 'https://nextgencloudfabric.com'
            }
        });
        console.log('Stream API response status:', apiRes.status);
        console.log('Stream API response data:', apiRes.data);
    } catch (e) {
        console.error('Stream API error:', e.response ? e.response.data : e.message);
    }

    // Test calling sourceApiUrl
    try {
        const sourceUrl = `https://nextgencloudfabric.com${config.sourceApiUrl}`;
        const sourceRes = await axios.post(sourceUrl, {
            token: config.playToken,
            tokenTs: config.playTokenTs,
            source: 'justhd'
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'Origin': 'https://nextgencloudfabric.com'
            }
        });
        console.log('Source API response:', sourceRes.data);
    } catch (e) {
        console.error('Source API error:', e.response ? e.response.data : e.message);
    }
}

testApi();
