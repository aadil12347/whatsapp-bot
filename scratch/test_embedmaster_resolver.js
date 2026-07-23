const axios = require('axios');
const cheerio = require('cheerio');

async function testEmbedMaster(id, type = 'movie', season = 1, episode = 1) {
    const embedUrl = type === 'tv'
        ? `https://embedmaster.link/tv/${id}/${season}/${episode}`
        : `https://embedmaster.link/movie/${id}`;

    console.log(`\n========================================`);
    console.log(`Querying EmbedMaster: ${embedUrl}`);

    const res = await axios.get(embedUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://embedmaster.link/'
        },
        timeout: 15000
    });

    console.log('HTML Status:', res.status);
    const $ = cheerio.load(res.data);

    // Look for hidden fields or form action
    const form = $('form');
    if (form.length) {
        console.log('Form action:', form.attr('action'));
        const inputs = {};
        form.find('input').each((i, el) => {
            inputs[$(el).attr('name')] = $(el).attr('value');
        });
        console.log('Form inputs:', inputs);

        // Submit form POST
        const action = form.attr('action');
        const postUrl = action.startsWith('http') ? action : `https://embedmaster.link${action}`;
        const params = new URLSearchParams();
        Object.keys(inputs).forEach(k => {
            if (k) params.append(k, inputs[k] || '');
        });

        console.log(`Posting to ${postUrl}...`);
        const postRes = await axios.post(postUrl, params.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': embedUrl,
                'Cookie': res.headers['set-cookie'] ? res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : ''
            },
            timeout: 15000
        });

        console.log('POST Response status:', postRes.status);
        const $post = cheerio.load(postRes.data);
        const scripts = $post('script').map((i, el) => $post(el).html()).get();
        console.log(`Player page scripts count: ${scripts.length}`);

        scripts.forEach((s, idx) => {
            if (!s) return;
            if (s.includes('m3u8') || s.includes('Playerjs') || s.includes('sources') || s.includes('file') || s.includes('eval')) {
                console.log(`\nScript ${idx} sample:\n`, s.substring(0, 800));
            }
        });
    } else {
        console.log('No form found in initial page.');
    }
}

async function run() {
    await testEmbedMaster('tt4003440'); // The House That Jack Built
    await testEmbedMaster('398173');    // TMDB ID
}

run().catch(console.error);
