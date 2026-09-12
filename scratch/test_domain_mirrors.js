const axios = require('axios');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

const vegaDomains = [
    'https://vegamovies.pages.dev',
    'https://vegamovies.im',
    'https://vegamovies.so',
    'https://vegamovies.net',
    'https://vegamovies.me'
];

const rogDomains = [
    'https://rogmovies.vip',
    'https://rogmovies.so',
    'https://rogmovies.net',
    'https://rogmovies.me',
    'https://rogmovies.pages.dev'
];

async function checkDomains(list, name) {
    for (const d of list) {
        try {
            console.log(`Checking ${name}: ${d}/?s=Superman`);
            const res = await axios.get(`${d}/?s=Superman`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
                },
                httpsAgent: browserHttpsAgent,
                timeout: 8000
            });
            console.log(`✅ ${name} mirror works: ${d} (Status ${res.status}, len ${res.data.length})`);
        } catch (err) {
            console.log(`❌ ${name} mirror failed: ${d} (${err.message})`);
        }
    }
}

async function main() {
    await checkDomains(vegaDomains, 'Vegamovies');
    await checkDomains(rogDomains, 'Rogmovies');
}

main();
