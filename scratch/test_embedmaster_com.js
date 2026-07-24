const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

async function testEmbedMasterCom() {
    console.log('--- Testing embedmaster.com homepage ---');
    try {
        const res = await axios.get('https://embedmaster.com/', { headers: HEADERS, timeout: 15000 });
        console.log('Homepage status:', res.status);
        console.log('Homepage length:', res.data.length);
        console.log('Homepage HTML snippet (first 1000 chars):\n', res.data.substring(0, 1000));
    } catch (e) {
        console.error('Homepage error:', e.message);
    }

    const movieTmdbId = '398173'; // The House That Jack Built
    const imdbId = 'tt4003440';

    const testUrls = [
        `https://embedmaster.com/movie/${movieTmdbId}`,
        `https://embedmaster.com/movie/${imdbId}`,
        `https://embedmaster.com/embed/movie/${movieTmdbId}`,
        `https://embedmaster.com/v/${movieTmdbId}`,
        `https://embedmaster.com/api/movie/${movieTmdbId}`
    ];

    for (const url of testUrls) {
        console.log(`\n--- Testing ${url} ---`);
        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
            console.log('Status:', res.status, 'Content-Length:', res.data.length);
            console.log('HTML preview:\n', res.data.substring(0, 800));
        } catch (e) {
            console.error('Error:', e.message, e.response ? e.response.status : '');
        }
    }
}

testEmbedMasterCom().catch(console.error);
