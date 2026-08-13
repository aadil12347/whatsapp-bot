const axios = require('axios');

async function extract10GbpsDirect(startUrl) {
    console.log('Resolving 10Gbps start URL:', startUrl);
    
    // Step 1: Follow HTTP redirects with GET (allowing axios to follow redirects naturally)
    const res = await axios.get(startUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        },
        maxRedirects: 10
    });

    const finalUrl = res.request?.res?.responseUrl || res.config?.url || startUrl;
    console.log('Final URL from axios GET:', finalUrl);

    // Step 2: Check if finalUrl contains link= parameter
    if (finalUrl.includes('link=')) {
        const linkMatch = finalUrl.match(/link=([^&]+)/);
        if (linkMatch && linkMatch[1]) {
            const decoded = decodeURIComponent(linkMatch[1]);
            console.log('✅ Found direct link parameter from finalUrl:', decoded);
            return decoded;
        }
    }

    // Step 3: Check HTML content for link= or googleusercontent or downloadBtn
    const html = res.data || '';
    if (html.includes('googleusercontent.com')) {
        const match = html.match(/https?:\/\/[^\s"']+\.googleusercontent\.com[^\s"']+/);
        if (match) {
            console.log('✅ Found googleusercontent link in HTML:', match[0]);
            return match[0];
        }
    }

    return finalUrl;
}

const testUrl = 'https://gpdl2.hubcloud.cx/?id=710ff3aefdb0c2bed919937f9d76efceac363048d64a6f2e78a7a755f1e52a458802d769a41e0915763cb16fb192cbe35e88f8d9d2eb540f2a1dd8b7fd8c5b661fc7678b77970c5af6b506fbdbb57cdf33800efd843b081f8b0405a67c08e05f4ccab0fa8532fd833d5f71f843b94d2e::6823a10dc940a555d90ddb589b77f70d';
extract10GbpsDirect(testUrl).catch(console.error);
