const axios = require('axios');

async function testGofile() {
    const url = 'https://gofile.io/d/bE4nvt';
    const contentId = 'bE4nvt';

    console.log(`[Test Gofile] Testing Content ID: ${contentId}`);

    // Gofile API v2 / getContent endpoints
    const apiEndpoints = [
        `https://api.gofile.io/contents/${contentId}?wt=4fd6a5519c6c`,
        `https://api.gofile.io/contents/${contentId}`,
        `https://api.gofile.io/getContent?contentId=${contentId}`,
    ];

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://gofile.io',
        'Referer': `https://gofile.io/d/${contentId}`
    };

    // First try getting a guest account token if required
    let accountToken = '';
    try {
        console.log('[Test Gofile] Creating guest account / getting token...');
        const accRes = await axios.post('https://api.gofile.io/accounts', {}, { headers });
        console.log('Account response:', accRes.data);
        if (accRes.data && accRes.data.data && accRes.data.data.token) {
            accountToken = accRes.data.data.token;
            console.log('Got guest token:', accountToken);
        }
    } catch (accErr) {
        console.log('Guest account creation error:', accErr.message);
    }

    const reqHeaders = {
        ...headers,
        ...(accountToken ? { 'Authorization': `Bearer ${accountToken}` } : {})
    };

    for (const ep of apiEndpoints) {
        console.log(`\nTesting GET: ${ep}`);
        try {
            const res = await axios.get(ep, { headers: reqHeaders, timeout: 10000 });
            console.log('Status:', res.status);
            console.log('Data:\n', JSON.stringify(res.data, null, 2).substring(0, 1500));
        } catch (err) {
            console.error('Error:', err.message);
            if (err.response) {
                console.error('Response Status:', err.response.status);
                console.error('Response Data:', err.response.data);
            }
        }
    }
}

testGofile();
