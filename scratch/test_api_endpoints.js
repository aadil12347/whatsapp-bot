const axios = require('axios');

async function testEndpoint(name, url) {
    console.log(`\n========================================`);
    console.log(`Testing ${name}: ${url}`);
    console.log(`========================================`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': url.split('/search')[0] + '/'
            },
            timeout: 15000
        });

        console.log('Status:', res.status);
        console.log('Hits found:', res.data?.found || res.data?.hits?.length || 0);
        if (res.data && res.data.hits && res.data.hits.length > 0) {
            console.log('First result title:', res.data.hits[0].document.post_title);
            console.log('First result permalink:', res.data.hits[0].document.permalink);
            console.log('First result thumbnail:', res.data.hits[0].document.post_thumbnail);
        }
    } catch (err) {
        console.error('API call failed:', err.message);
        if (err.response) console.error('Status:', err.response.status);
    }
}

async function run() {
    await testEndpoint('Vegamovies (Batman)', 'https://new1.vegamovies.futbol/search.php?q=batman&page=1');
    await testEndpoint('Vegamovies (Batman Arise)', 'https://new1.vegamovies.futbol/search.php?q=batman%20arise&page=1');
    await testEndpoint('Rogmovies (Pyaar)', 'https://new1.rogmovies.click/ts-search.php?q=pyaar&page=1');
    await testEndpoint('Rogmovies (Honeymoon)', 'https://new1.rogmovies.click/ts-search.php?q=honeymoon+par&page=1');
}

run();
