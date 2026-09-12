const axios = require('axios');
const { getDomain } = require('../src/Utils/domain_manager');

(async () => {
    const vegaDomain = getDomain('vegamovies');
    console.log('VegaDomain:', vegaDomain);
    const url = `${vegaDomain}search.php?q=Superman&page=1`;
    console.log('URL:', url);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': vegaDomain
            },
            timeout: 10000
        });
        console.log('Status:', res.status);
        console.log('Hits length:', res.data?.hits?.length);
        if (res.data?.hits?.length > 0) {
            console.log('First hit doc:', res.data.hits[0].document);
        }
    } catch(e) {
        console.log('Error:', e.message);
    }
})();
