const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent, scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function inspectPostVcloud(url, name) {
    console.log(`\n==================================================`);
    console.log(`Inspecting ${name}: ${url}`);
    console.log(`==================================================`);

    try {
        const scraped = await scrapeAllPostLinks(url);
        console.log(`Scraped ${scraped.length} link options from post.`);

        for (let i = 0; i < scraped.length; i++) {
            const item = scraped[i];
            console.log(`\n--- [${name}] Option #${i + 1} (${item.resolution}) ---`);
            console.log(`Heading: ${item.heading}`);
            console.log(`Nexdrive URL: ${item.href}`);

            // Fetch Nexdrive
            try {
                const resNex = await axios.get(item.href, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0 Safari/537.36' },
                    httpsAgent: browserHttpsAgent
                });
                const $nex = cheerio.load(resNex.data);
                const vcloudLinks = [];
                $nex('a[href]').each((_, el) => {
                    const h = $nex(el).attr('href');
                    if (h && (h.includes('vcloud') || h.includes('hubcloud') || h.includes('hubdrive'))) {
                        vcloudLinks.push(h);
                    }
                });

                console.log(`VCloud links found on Nexdrive:`, vcloudLinks);

                for (const vUrl of vcloudLinks) {
                    // Fetch VCloud initial page
                    const resV1 = await axios.get(vUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0 Safari/537.36' },
                        httpsAgent: browserHttpsAgent
                    });
                    const $v1 = cheerio.load(resV1.data);
                    let tokenUrl = null;
                    $v1('script').each((_, el) => {
                        const txt = $v1(el).text();
                        const atobMatch = txt.match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
                        if (atobMatch && atobMatch[1]) {
                            try {
                                const step1 = Buffer.from(atobMatch[1], 'base64').toString('utf8');
                                tokenUrl = Buffer.from(step1, 'base64').toString('utf8');
                            } catch (e) {}
                        }
                    });

                    console.log(`Decoded VCloud Token URL: ${tokenUrl}`);

                    if (tokenUrl) {
                        const resV2 = await axios.get(tokenUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0.0.0 Safari/537.36',
                                'Referer': vUrl
                            },
                            httpsAgent: browserHttpsAgent
                        });
                        const $v2 = cheerio.load(resV2.data);
                        console.log(`VCloud Landing Page Buttons:`);
                        $v2('a[href]').each((idx, el) => {
                            console.log(`   Button ${idx}: [${$v2(el).text().trim()}] -> ${$v2(el).attr('href')}`);
                        });
                    }
                }
            } catch (errNex) {
                console.error(`Error inspecting option ${i + 1}:`, errNex.message);
            }
        }

    } catch (err) {
        console.error(`Post scrape failed:`, err.message);
    }
}

async function run() {
    await inspectPostVcloud('https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/', 'RogMovies - Lenin');
    await inspectPostVcloud('https://new2.vegamovies.futbol/download-backrooms-2026-hindi-org-english-480p-720p-1080p-web-dl/', 'VegaMovies - Backrooms');
    await inspectPostVcloud('https://new2.rogmovies.click/download-pyaar-prema-kalyanam-2026-hindi-org-dubbed-web-dl-480p-720p-1080p/', 'RogMovies - Pyaar Prema Kalyanam');
}

run();
