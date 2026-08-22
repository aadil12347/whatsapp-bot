const axios = require('axios');
const cheerio = require('cheerio');
const { scrapeAllPostLinks, resolveVcloudLink } = require('../src/Utils/movie_scraper');

async function extractLeninPostFull() {
    const postUrl = 'https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/';
    console.log(`================================================================================`);
    console.log(`🎬 EXPORTING DIRECT DOWNLOAD LINKS FOR: Lenin (2026)`);
    console.log(`URL: ${postUrl}`);
    console.log(`================================================================================\n`);

    try {
        const postRes = await axios.get(postUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            }
        });

        const $ = cheerio.load(postRes.data);
        const options = [];

        $('a[href*="nexdrive"]').each((i, el) => {
            const href = $(el).attr('href');
            let heading = $(el).closest('p, div, blockquote').prevAll('h3, h4, h5, p').first().text().trim();
            if (!heading || heading.length < 5) {
                heading = $(el).parent().text().trim();
            }
            options.push({
                optionNumber: i + 1,
                heading,
                nextdriveUrl: href
            });
        });

        console.log(`📌 Found ${options.length} Download Quality Options on Detail Page.\n`);

        const summary = [];

        for (const opt of options) {
            console.log(`--------------------------------------------------------------------------------`);
            console.log(`[Option #${opt.optionNumber}] ${opt.heading}`);
            console.log(`Nextdrive Link: ${opt.nextdriveUrl}`);
            
            let directUrl = null;
            let chosenServerName = null;

            try {
                const landingRes = await axios.get(opt.nextdriveUrl, {
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
                    if (lowerH.includes('vcloud') || lowerH.includes('fastdl') || lowerH.includes('filebee') || lowerH.includes('gofile') || lowerH.includes('vegadrive') || lowerH.includes('vikingfile') || lowerH.includes('megaup')) {
                        servers.push({ text: text || 'Server Link', href: h });
                    }
                });

                console.log(`  Found ${servers.length} download servers on Nextdrive landing page.`);

                for (const server of servers) {
                    console.log(`  Resolving server: [${server.text}] (${server.href})...`);
                    try {
                        const resolved = await resolveVcloudLink(server.href, null, opt.nextdriveUrl);
                        if (resolved && resolved.startsWith('http')) {
                            directUrl = resolved;
                            chosenServerName = server.text;
                            console.log(`  ✅ Successfully resolved direct link via [${server.text}]`);
                            break;
                        }
                    } catch (sErr) {
                        console.log(`  ⚠️ Server [${server.text}] failed: ${sErr.message}`);
                    }
                }

            } catch (err) {
                console.error(`❌ Failed to fetch Nextdrive page: ${err.message}`);
            }

            console.log(`🎯 Direct Download URL: ${directUrl || 'FAILED'}\n`);

            summary.push({
                option: opt.optionNumber,
                heading: opt.heading,
                nextdriveUrl: opt.nextdriveUrl,
                serverUsed: chosenServerName || 'N/A',
                directUrl: directUrl || 'FAILED'
            });
        }

        console.log(`================================================================================`);
        console.log(`📋 FINAL EXTRACTED POST SUMMARY (Lenin 2026):`);
        console.log(`================================================================================\n`);

        summary.forEach(s => {
            console.log(`Option #${s.option}: ${s.heading}`);
            console.log(`• Nextdrive Landing : ${s.nextdriveUrl}`);
            console.log(`• Server Used       : ${s.serverUsed}`);
            console.log(`• Direct Download   : ${s.directUrl}\n`);
        });

    } catch (e) {
        console.error('Extraction failed:', e.message);
    }
}

extractLeninPostFull();
