const axios = require('axios');
const cheerio = require('cheerio');

async function testIframeParse(tmdbId, isTv = false, season = 1, episode = 1) {
    const embedUrl = isTv 
        ? `https://streamimdb.ru/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://streamimdb.ru/embed/movie/${tmdbId}`;

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://streamimdb.ru/'
    };

    console.log('1. Fetching streamimdb embed:', embedUrl);
    const res1 = await axios.get(embedUrl, { headers });
    const $1 = cheerio.load(res1.data);
    let nextgenUrl = $1('#pf').attr('src') || '';

    if (!nextgenUrl) {
        const match = res1.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (match) nextgenUrl = match[1];
    }

    if (!nextgenUrl) {
        throw new Error('Could not find player iframe on streamimdb embed page');
    }

    if (nextgenUrl.startsWith('//')) nextgenUrl = `https:${nextgenUrl}`;

    console.log('2. Found nextgen iframe URL:', nextgenUrl);

    const res2 = await axios.get(nextgenUrl, {
        headers: {
            ...headers,
            'Referer': embedUrl
        }
    });

    const configMatch = res2.data.match(/const CONFIG = ({[\s\S]*?});/);
    if (!configMatch) throw new Error('Could not parse CONFIG from nextgen embed page');

    const config = JSON.parse(configMatch[1]);
    console.log('3. Parsed CONFIG playToken:', config.playToken);

    let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'tmdb'}=${config.mediaId || tmdbId}&type=${config.mediaType || 'movie'}`;
    if ((config.mediaType === 'tv' || isTv) && season && episode) {
        apiUrl += `&season=${season}&episode=${episode}`;
    }
    apiUrl += `&token=${config.playToken}&tokenTs=${config.playTokenTs}`;

    console.log('4. Calling StreamData API:', apiUrl);
    const apiRes = await axios.get(apiUrl, {
        headers: {
            'User-Agent': headers['User-Agent'],
            'Referer': nextgenUrl,
            'Origin': new URL(nextgenUrl).origin
        }
    });

    console.log('5. API Response status:', apiRes.status);
    console.log('6. Stream URLs:', apiRes.data.data ? apiRes.data.data.stream_urls : apiRes.data);
}

testIframeParse('1339713').catch(console.error);
