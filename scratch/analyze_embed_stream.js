const axios = require('axios');

async function checkEmbed() {
    const url = 'https://streamimdb.ru/embed/movie/1339713';
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://streamimdb.ru/movie/h370-interstellar'
        }
    });

    console.log('HTML length:', res.data.length);

    // Search for script tags or iframes
    const iframes = res.data.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
    console.log('Iframes found:', iframes);

    const m3u8Matches = res.data.match(/https?:\/\/[^"'\s]+\.m3u8[^\s"']*/gi);
    console.log('m3u8 matches:', m3u8Matches);

    const dataSrc = res.data.match(/data-[a-z-]+=["']([^"']+)["']/gi);
    console.log('Data attributes:', dataSrc);

    // Let's check autoembed, vidsrc, etc.
    const autoEmbedUrl = 'https://autoembed.co/movie/tmdb/1339713';
    try {
        const aeRes = await axios.get(autoEmbedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://streamimdb.ru/'
            }
        });
        console.log('\n--- AutoEmbed HTML ---');
        console.log(aeRes.data.substring(0, 1000));
        const aeIframes = aeRes.data.match(/<iframe[^>]+src=["']([^"']+)["']/gi);
        console.log('AutoEmbed iframes:', aeIframes);
    } catch (e) {
        console.log('AutoEmbed error:', e.message);
    }
}

checkEmbed().catch(console.error);
