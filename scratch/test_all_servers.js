const axios = require('axios');

async function testServers() {
    const embedUrl = 'https://nextgencloudfabric.com/embed/movie/1339713';
    const res = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://streamimdb.ru/'
        }
    });

    const configMatch = res.data.match(/const CONFIG = ({[\s\S]*?});/);
    const config = JSON.parse(configMatch[1]);
    const apiUrl = `${config.streamDataApiUrl}?tmdb=${config.mediaId}&type=${config.mediaType}&token=${config.playToken}&tokenTs=${config.playTokenTs}`;

    const apiRes = await axios.get(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': embedUrl,
            'Origin': 'https://nextgencloudfabric.com'
        }
    });

    const streamUrls = apiRes.data.data.stream_urls;
    console.log('Stream URLs count:', streamUrls.length);

    for (let i = 0; i < streamUrls.length; i++) {
        const u = streamUrls[i];
        try {
            const check = await axios.head(u, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://nextgencloudfabric.com/'
                },
                timeout: 5000
            });
            console.log(`[Server ${i + 1}] ${u.substring(0, 50)}... -> HEAD Status:`, check.status);
        } catch (e) {
            console.log(`[Server ${i + 1}] ${u.substring(0, 50)}... -> HEAD Error:`, e.response ? e.response.status : e.message);
        }
    }
}

testServers();
