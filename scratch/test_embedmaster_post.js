const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const imdbId = 'tt4003440';
    console.log(`Step 1: GET https://embedmaster.link/movie/${imdbId}...`);
    const res1 = await axios.get(`https://embedmaster.link/movie/${imdbId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://embedmaster.link/'
        }
    });

    const $1 = cheerio.load(res1.data);
    const form = $1('form#welcome-play-form').length ? $1('form#welcome-play-form') : $1('form').first();
    const action = form.attr('action');
    const attest = form.find('input[name="attest"]').val();
    const origReferer = form.find('input[name="orig_referer"]').val();

    console.log('Action URL:', action);
    console.log('Attest token:', attest ? attest.substring(0, 30) + '...' : 'null');

    const postUrl = action.startsWith('http') ? action : `https://embedmaster.link${action}`;
    const params = new URLSearchParams();
    params.append('attest', attest);
    params.append('orig_referer', origReferer || 'https://embedmaster.link/');

    console.log(`\nStep 2: POST to ${postUrl}...`);
    const res2 = await axios.post(postUrl, params.toString(), {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': `https://embedmaster.link/movie/${imdbId}`,
            'Origin': 'https://embedmaster.link'
        }
    });

    console.log('POST Response status:', res2.status);
    console.log('POST Response sample:\n', res2.data.substring(0, 1500));

    const $2 = cheerio.load(res2.data);
    const iframes = $2('iframe').map((i, el) => $2(el).attr('src')).get();
    console.log('\nIframes found in player page:', iframes);

    const scripts = $2('script').map((i, el) => $2(el).html()).get();
    console.log(`Scripts found in player page: ${scripts.length}`);
    scripts.forEach((s, idx) => {
        if (s && (s.includes('m3u8') || s.includes('eval') || s.includes('sources') || s.includes('file') || s.includes('CONFIG') || s.includes('player'))) {
            console.log(`\nPlayer Script ${idx}:\n`, s.substring(0, 1000));
        }
    });
}

test().catch(console.error);
