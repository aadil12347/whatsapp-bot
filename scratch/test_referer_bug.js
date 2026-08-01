const axios = require('axios');

async function testRefererBug() {
    const hubUrl = 'https://gpdl2.hubcloud.cx/?id=a6c3e974108e9bb26675ab00caf06ba4dd86e8e17a6c25cd9c52476b44ecf25b58078498c0375b20b2f6e273fbcdf72f956960b91677e22ff10d4d33fbc0f2a4be80e61866532fec5e4040031ab64bf5e7ee4d2df896d46b9b82be37da459da6597743341a25c075c6444f9b50b66125::cf12e9e03dc7aaa4044d6cf333ecda55';

    console.log('=== Test WITHOUT Referer header ===');
    try {
        const res1 = await axios.get(hubUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
            },
            maxRedirects: 10
        });
        console.log('WITHOUT Referer Final URL:', res1.request.res.responseUrl || res1.config.url);
    } catch (e) {
        console.log('Error without referer:', e.message);
    }

    console.log('\n=== Test WITH Referer header ===');
    try {
        const res2 = await axios.get(hubUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://vcloud.zip/'
            },
            maxRedirects: 10
        });
        console.log('WITH Referer Final URL:', res2.request.res.responseUrl || res2.config.url);
    } catch (e) {
        console.log('Error with referer:', e.message);
    }
}

testRefererBug();
