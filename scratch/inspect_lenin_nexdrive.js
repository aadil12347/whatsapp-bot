const axios = require('axios');
const cheerio = require('cheerio');

async function inspectNexdrives() {
    const url = 'https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/';
    console.log('Fetching detail page:', url);
    
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        }
    });

    const $ = cheerio.load(res.data);

    // Let's examine how each download button is placed with headings/resolutions
    const downloadBlocks = [];

    $('a[href*="nexdrive"]').each((i, el) => {
        const linkHref = $(el).attr('href');
        const linkText = $(el).text().trim();
        
        // Find closest preceding heading or p element
        let heading = $(el).closest('p, div, blockquote').prevAll('h3, h4, h5, p').first().text().trim();
        let parentText = $(el).parent().text().trim();

        downloadBlocks.push({
            index: i + 1,
            linkText,
            linkHref,
            parentText,
            heading
        });
    });

    console.log('\n--- DETAILED LINK OPTIONS ON POST ---');
    console.log(JSON.stringify(downloadBlocks, null, 2));

    console.log('\n--- FETCHING CONTENT FROM EACH NEXDRIVE LINK ---');
    for (const b of downloadBlocks) {
        console.log(`\n==================================================`);
        console.log(`OPTION #${b.index}: ${b.heading || b.parentText}`);
        console.log(`Landing URL: ${b.linkHref}`);
        console.log(`==================================================`);

        try {
            const landingRes = await axios.get(b.linkHref, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                    'Referer': url
                },
                maxRedirects: 5
            });

            const landing$ = cheerio.load(landingRes.data);
            console.log('Landing Title:', landing$('title').text().trim());

            // Extract links on nexdrive page (e.g. VCloud, FastDL, HubCloud, Direct links, etc.)
            const subLinks = [];
            landing$('a[href]').each((_, a) => {
                const h = landing$(a).attr('href');
                const t = landing$(a).text().trim();
                if (h && !h.startsWith('#') && !h.includes('javascript:') && !h.includes('telegram')) {
                    subLinks.push({ text: t, href: h });
                }
            });

            console.log(`Found ${subLinks.length} sub-links on nexdrive landing page:`);
            subLinks.forEach((sl, idx) => console.log(`  [${idx + 1}] "${sl.text}" -> ${sl.href}`));

        } catch (err) {
            console.error(`Failed to fetch ${b.linkHref}:`, err.message);
        }
    }
}

inspectNexdrives();
