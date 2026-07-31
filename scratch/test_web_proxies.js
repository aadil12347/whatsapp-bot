const axios = require('axios');

async function testWebProxies() {
    const targetUrl = 'https://vcloud.zip/mrg9sjg5ec1nuze';
    
    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const pUrl of proxies) {
        console.log('\n--- Testing proxy:', pUrl.substring(0, 50), '---');
        try {
            const res = await axios.get(pUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
                },
                timeout: 10000
            });
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            console.log('Status:', res.status, 'Body len:', body.length);
            if (body.includes('atob(')) {
                console.log('✅ SUCCESS! Contains atob(');
                const match = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g.exec(body);
                if (match && match[1]) {
                    console.log('Token found:', match[1]);
                }
            } else {
                console.log('Snippet:', body.substring(0, 200).replace(/\s+/g, ' '));
            }
        } catch (err) {
            console.log('Failed:', err.message);
        }
    }
}

testWebProxies();
