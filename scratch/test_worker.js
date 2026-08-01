const axios = require('axios');

async function testWorker() {
    const url = 'https://gpdl2.rohitkiskk.workers.dev/?id=a6c3e974108e9bb26675ab00caf06ba4dd86e8e17a6c25cd9c52476b44ecf25b58078498c0375b20b2f6e273fbcdf72f956960b91677e22ff10d4d33fbc0f2a4be80e61866532fec5e4040031ab64bf5e7ee4d2df896d46b9b82be37da459da6597743341a25c075c6444f9b50b66125::cf12e9e03dc7aaa4044d6cf333ecda55';
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            maxRedirects: 5,
            validateStatus: () => true
        });
        console.log('Worker Response Status:', res.status);
        console.log('Worker Location Header:', res.headers['location']);
        console.log('Worker Final URL:', res.request.res.responseUrl || res.config.url);
        console.log('Worker Body Snippet:', String(res.data).substring(0, 500));
    } catch (e) {
        console.error('Worker test error:', e.message);
    }
}

testWorker();
