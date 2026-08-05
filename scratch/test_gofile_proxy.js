const axios = require('axios');

async function testGofileProxy() {
    const contentId = 'bE4nvt';
    console.log(`[Proxy Test] Testing Gofile API with proxies for: ${contentId}`);

    const proxies = [
        { host: '198.105.121.200', port: 6462, auth: { username: 'nsdjrpwt', password: '' } },
        { host: '38.154.185.97', port: 6370, auth: { username: 'kboirlds', password: '' } },
        { host: '45.38.107.97', port: 6014, auth: { username: 'kboirlds', password: '' } }
    ];

    const wt = '4fd6sg89d7s6';
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Origin': 'https://gofile.io',
        'Referer': 'https://gofile.io/d/bE4nvt',
        'Accept': '*/*'
    };

    // Create guest account
    let token = '';
    try {
        const accRes = await axios.post('https://api.gofile.io/accounts', {}, { headers });
        token = accRes.data?.data?.token || '';
        console.log('Got account token:', token);
    } catch (e) {
        console.log('Account creation failed:', e.message);
    }

    const reqHeaders = {
        ...headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    for (const p of proxies) {
        console.log(`\nTrying Proxy: ${p.host}:${p.port}...`);
        try {
            const res = await axios.get(`https://api.gofile.io/contents/${contentId}?wt=${wt}`, {
                headers: reqHeaders,
                proxy: p,
                timeout: 8000
            });

            console.log('✅ PROXY SUCCESS! Response:\n', JSON.stringify(res.data, null, 2));
            if (res.data && res.data.data && res.data.data.children) {
                const children = res.data.data.children;
                Object.values(children).forEach(item => {
                    console.log(`\n🎉 FILE FOUND: ${item.name}`);
                    console.log(`Direct Link: ${item.link}`);
                    if (item.server) {
                        console.log(`Web Direct Link: https://${item.server}.gofile.io/download/web/${item.id}/${encodeURIComponent(item.name)}`);
                    }
                });
                return;
            }
        } catch (err) {
            console.log('❌ Proxy Failed:', err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }
}

testGofileProxy();
