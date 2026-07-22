const axios = require('axios');

async function testNextgen() {
    const url = 'https://nextgencloudfabric.com/embed/movie/1339713';
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://streamimdb.ru/'
            }
        });
        console.log('Nextgen HTML status:', res.status);
        console.log('Nextgen HTML length:', res.data.length);
        console.log(res.data.substring(0, 2000));

        const m3u8 = res.data.match(/https?:\/\/[^"'\s]+\.m3u8[^\s"']*/gi) || res.data.match(/["']([^"']+\.m3u8[^\s"']*)["']/gi);
        console.log('m3u8 found:', m3u8);

        const scripts = res.data.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        console.log('Script count:', scripts ? scripts.length : 0);
        if (scripts) {
            scripts.forEach((s, idx) => {
                if (s.includes('file') || s.includes('hls') || s.includes('source') || s.includes('m3u8') || s.includes('eval')) {
                    console.log(`\n--- Script ${idx} ---`);
                    console.log(s.substring(0, 1000));
                }
            });
        }
    } catch (e) {
        console.error('Error fetching Nextgen:', e.message);
    }
}

testNextgen();
