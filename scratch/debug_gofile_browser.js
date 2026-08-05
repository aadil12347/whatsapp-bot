const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function debugGofileBrowser() {
    console.log('[Debug] Simulating browser request to Gofile...');

    // Step 1: GET https://gofile.io/d/bE4nvt to collect cookies & HTML
    const pageRes = await axios.get('https://gofile.io/d/bE4nvt', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        httpsAgent: browserHttpsAgent
    });

    console.log('Page Status:', pageRes.status);
    const cookies = pageRes.headers['set-cookie'] || [];
    console.log('Page Cookies:', cookies);

    // Step 2: Fetch wt token from config.js
    const configRes = await axios.get('https://gofile.io/dist/js/config.js', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Referer': 'https://gofile.io/d/bE4nvt'
        },
        httpsAgent: browserHttpsAgent
    });

    const configTxt = configRes.data;
    console.log('config.js contents:', configTxt);

    // Step 3: Fetch wt.obf.js
    const wtRes = await axios.get('https://gofile.io/dist/js/wt.obf.js', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://gofile.io/d/bE4nvt'
        },
        httpsAgent: browserHttpsAgent
    });
    console.log('wt.obf.js length:', wtRes.data.length);

    // Step 4: Create guest account
    const accRes = await axios.post('https://api.gofile.io/accounts', {}, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Origin': 'https://gofile.io',
            'Referer': 'https://gofile.io/d/bE4nvt'
        },
        httpsAgent: browserHttpsAgent
    });

    console.log('Accounts API Response:', accRes.data);
    const token = accRes.data?.data?.token;

    // Step 5: Test contents API with different wt values
    const wtValues = ['4fd6sg89d7s6', '4fd6a5519c6c', 'bE4nvt', ''];
    for (const w of wtValues) {
        console.log(`\nTesting contents API with wt="${w}"...`);
        try {
            const res = await axios.get(`https://api.gofile.io/contents/bE4nvt?wt=${w}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Authorization': `Bearer ${token}`,
                    'Origin': 'https://gofile.io',
                    'Referer': 'https://gofile.io/d/bE4nvt',
                    'Accept': '*/*'
                },
                httpsAgent: browserHttpsAgent
            });
            console.log('✅ Success! Data:\n', JSON.stringify(res.data, null, 2));
        } catch (err) {
            console.log('❌ Failed:', err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }
}

debugGofileBrowser();
