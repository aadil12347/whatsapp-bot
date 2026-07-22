const axios = require('axios');

async function getStreamUrl(tmdbId, isTv = false, season = 1, episode = 1) {
    const embedUrl = isTv 
        ? `https://nextgencloudfabric.com/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://nextgencloudfabric.com/embed/movie/${tmdbId}`;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://streamimdb.ru/'
    };

    const res = await axios.get(embedUrl, { headers });
    const configMatch = res.data.match(/const CONFIG = ({[\s\S]*?});/);
    if (!configMatch) throw new Error('Failed to parse CONFIG from embed page');

    const config = JSON.parse(configMatch[1]);
    console.log('Got Config token:', config.playToken);

    let apiUrl = `${config.streamDataApiUrl}?${config.idType || 'tmdb'}=${config.mediaId}&type=${config.mediaType}`;
    if (config.mediaType === 'tv' && season && episode) {
        apiUrl += `&season=${season}&episode=${episode}`;
    }
    apiUrl += `&token=${config.playToken}&tokenTs=${config.playTokenTs}`;

    const apiRes = await axios.get(apiUrl, {
        headers: {
            'User-Agent': headers['User-Agent'],
            'Referer': embedUrl,
            'Origin': 'https://nextgencloudfabric.com'
        }
    });

    if (!apiRes.data || apiRes.data.status_code !== '200' || !apiRes.data.data || !apiRes.data.data.stream_urls) {
        throw new Error(`Stream API error: ${JSON.stringify(apiRes.data)}`);
    }

    const streamUrls = apiRes.data.data.stream_urls;
    console.log('Found stream URLs:', streamUrls);
    return streamUrls;
}

getStreamUrl('1339713').then(urls => {
    console.log('SUCCESS! Streams:', urls);
}).catch(console.error);
