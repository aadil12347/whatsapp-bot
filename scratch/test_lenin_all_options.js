const axios = require('axios');
const cheerio = require('cheerio');
const { resolveVcloudLink } = require('../src/Utils/movie_scraper');

async function testLeninAllOptions() {
    const postUrl = 'https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/';
    console.log(`Fetching post detail page: ${postUrl}`);

    const res = await axios.get(postUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        }
    });

    const $ = cheerio.load(res.data);
    const nexdrives = [];

    $('a[href*="nexdrive"]').each((i, el) => {
        const href = $(el).attr('href');
        let heading = $(el).closest('p, div, blockquote').prevAll('h3, h4, h5, p').first().text().trim();
        nexdrives.push({ index: i + 1, href, heading });
    });

    console.log(`Found ${nexdrives.length} Nexdrive Options on Post Page:\n`);

    for (const opt of nexdrives) {
        console.log(`==================================================`);
        console.log(`OPTION #${opt.index}: ${opt.heading}`);
        console.log(`Nexdrive URL: ${opt.href}`);
        console.log(`==================================================`);

        try {
            const landingRes = await axios.get(opt.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                    'Referer': postUrl
                }
            });

            const landing$ = cheerio.load(landingRes.data);
            const servers = [];

            landing$('a[href]').each((_, a) => {
                const h = landing$(a).attr('href');
                const text = landing$(a).text().trim();
                if (!h || h.startsWith('#') || h.includes('javascript:') || h.includes('telegram') || h.includes('category')) return;
                
                const lowerH = h.toLowerCase();
                const lowerT = text.toLowerCase();

                if (lowerH.includes('fastdl') || lowerH.includes('vcloud') || lowerH.includes('filebee') || lowerH.includes('gofile') || lowerH.includes('vegadrive') || lowerH.includes('vikingfile') || lowerH.includes('megaup')) {
                    servers.push({ text: text || 'Server Link', href: h });
                }
            });

            console.log(`Found ${servers.length} server links on Nexdrive page:`);
            servers.forEach((s, idx) => console.log(`  [Server #${idx + 1}] ${s.text} -> ${s.href}`));

            let resolvedDirect = null;
            let successServer = null;

            for (const s of servers) {
                console.log(`\n  Resolving direct link for [${s.text}] (${s.href})...`);
                try {
                    const direct = await resolveVcloudLink(s.href, null, opt.href);
                    if (direct && direct.startsWith('http')) {
                        resolvedDirect = direct;
                        successServer = s.text;
                        console.log(`  ✅ SUCCESS via [${s.text}]: ${direct}`);
                        break;
                    }
                } catch (err) {
                    console.log(`  ❌ Failed for [${s.text}]: ${err.message}`);
                }
            }

            console.log(`\n🎯 FINAL DIRECT URL FOR OPTION #${opt.index}: ${resolvedDirect || 'FAILED'}\n`);

        } catch (err) {
            console.error(`Failed to process Nexdrive landing page #${opt.index}:`, err.message);
        }
    }
}

testLeninAllOptions();
