const axios = require('axios');

async function testBoth() {
    const tmdbId = '157336'; // Interstellar
    const embedUrl = `https://nextgencloudfabric.com/embed/movie/${tmdbId}`;

    const res = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://streamimdb.ru/'
        }
    });

    const configMatch = res.data.match(/const CONFIG = ({[\s\S]*?});/);
    if (!configMatch) {
        console.error('Config match failed');
        return;
    }
    const config = JSON.parse(configMatch[1]);
    console.log('CONFIG:', config);

    // 1. Test streamDataApiUrl: https://streamdata.vaplayer.ru/api.php?tmdb=157336&type=movie
    const url1 = `${config.streamDataApiUrl}?tmdb=${config.mediaId}&type=${config.mediaType}&token=${config.playToken}&tokenTs=${config.playTokenTs}`;
    console.log('Testing url1:', url1);
    try {
        const r1 = await axios.get(url1, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'Origin': 'https://nextgencloudfabric.com'
            }
        });
        console.log('r1 status:', r1.status);
        console.log('r1 data:', r1.data);
    } catch (e) {
        console.error('r1 error:', e.message);
    }

    // 2. Test sourceApiUrl: https://nextgencloudfabric.com/embed/source-api.php?source=justhd&tmdb=157336&type=movie
    const url2 = `https://nextgencloudfabric.com${config.sourceApiUrl}?source=justhd&tmdb=${config.mediaId}&type=${config.mediaType}`;
    console.log('\nTesting url2:', url2);
    try {
        const r2 = await axios.get(url2, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'Origin': 'https://nextgencloudfabric.com',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        console.log('r2 status:', r2.status);
        console.log('r2 data:', r2.data);
    } catch (e) {
        console.error('r2 error:', e.message);
    }
}

testBoth();
