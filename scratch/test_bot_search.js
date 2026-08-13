const axios = require('axios');

const VEGAMOVIES_DOMAIN = process.env.VEGAMOVIES_DOMAIN || 'https://new1.vegamovies.futbol';
const ROGMOVIES_DOMAIN = process.env.ROGMOVIES_DOMAIN || 'https://new1.rogmovies.click';

async function performSearch(source, query) {
    const isRog = source === 'rogmovies';
    const siteDomain = isRog ? ROGMOVIES_DOMAIN : VEGAMOVIES_DOMAIN;
    const apiPath = isRog ? '/ts-search.php' : '/search.php';
    const url = `${siteDomain}${apiPath}?q=${encodeURIComponent(query)}&page=1`;

    console.log(`\n🔍 Searching ${source} (${url})...`);

    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': siteDomain + '/'
        },
        timeout: 15000
    });

    if (res.data && res.data.hits) {
        const results = res.data.hits.map(h => {
            let permalink = h.document.permalink || '';
            if (permalink && !permalink.startsWith('http')) {
                permalink = `${siteDomain}${permalink.startsWith('/') ? '' : '/'}${permalink}`;
            }
            let thumbnail = h.document.post_thumbnail || null;
            if (thumbnail && !thumbnail.startsWith('http')) {
                thumbnail = `${siteDomain}${thumbnail.startsWith('/') ? '' : '/'}${thumbnail}`;
            }
            return {
                title: h.document.post_title.replace(/&amp;/g, '&'),
                permalink,
                thumbnail
            };
        });

        console.log(`✅ Found ${results.length} result(s) for "${query}":`);
        results.slice(0, 3).forEach((r, i) => {
            console.log(`  [${i + 1}] ${r.title}`);
            console.log(`      Link: ${r.permalink}`);
        });
        return results;
    } else {
        console.log(`❌ No results for "${query}"`);
        return [];
    }
}

async function main() {
    await performSearch('vegamovies', 'batman');
    await performSearch('vegamovies', 'batman arise');
    await performSearch('rogmovies', 'pyaar');
    await performSearch('rogmovies', 'honeymoon par');
}

main().catch(console.error);
