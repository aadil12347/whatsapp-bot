const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function resolveDirectLink(url) {
    // Strategy A: Instant HubCDN decoder
    if (url.includes('hubcdn')) {
        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 8000 });
            const html = res.data;
            const matches = html.match(/r=(aHR0cHM[A-Za-z0-9%_-]+)/g);
            if (matches) {
                for (const m of matches) {
                    const b64 = m.replace('r=', '');
                    try {
                        const decoded = Buffer.from(b64, 'base64').toString('utf8');
                        if (decoded.includes('link=')) {
                            let direct = decoded.split('link=')[1];
                            if (direct.includes('&')) direct = direct.split('&')[0];
                            return decodeURIComponent(direct);
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    // Strategy B: HubCloud Drive / search-recover -> sportverse.cc / gamerxyt.com
    let currentUrl = url;
    if (currentUrl.includes('hubcloud.foo/drive/search-recover.php')) {
        try {
            const apiRes = await axios.get(`${currentUrl}&api=search`, { headers: { ...HEADERS, Accept: 'application/json' }, timeout: 8000 });
            if (apiRes.data && apiRes.data.hits && apiRes.data.hits.length > 0) {
                currentUrl = apiRes.data.hits[0].url;
            }
        } catch (_) {}
    }

    if (currentUrl.includes('hubcloud')) {
        try {
            const res1 = await axios.get(currentUrl, { headers: HEADERS, timeout: 8000 });
            const $1 = cheerio.load(res1.data);
            const genLink = $1('a[href*="hubcloud.php"]').attr('href');
            if (genLink) {
                const res2 = await axios.get(genLink, { headers: HEADERS, timeout: 8000 });
                const $2 = cheerio.load(res2.data);
                
                let dlUrl = null;
                $2('a[href]').each((_, el) => {
                    const href = $2(el).attr('href');
                    const text = $2(el).text().trim().toLowerCase();
                    if (!dlUrl && href && (text.includes('10gbps') || text.includes('zipdisk') || text.includes('fsl') || href.includes('googleapis') || href.includes('workers.dev'))) {
                        dlUrl = href;
                    }
                });

                if (dlUrl) return dlUrl;
            }
        } catch (_) {}
    }

    return currentUrl;
}

async function testTriggerFullSeries() {
    const postUrl = 'https://new3.hdhub4u.cl/trigger-season-1-webrip-hindi-full-series/';
    console.log(`Scraping all post links for ${postUrl}...`);
    
    const res = await axios.get(postUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const episodeLinks = [];
    const seenLinks = new Set();

    $('a[href]').each((_, el) => {
        let href = $(el).attr('href');
        let text = $(el).text().trim();
        let parentText = $(el).parent().text().trim();

        if (!href || seenLinks.has(href)) return;

        let precedingHeading = '';
        let prev = $(el).closest('p, div, h4, h3, h2').prev();
        let count = 0;
        while (prev.length && count < 5) {
            const t = prev.text().trim();
            if (t) { precedingHeading = t; break; }
            prev = prev.prev();
            count++;
        }

        let qDecoded = '';
        if (href.includes('q=')) {
            try {
                const parsed = new URL(href);
                const qVal = parsed.searchParams.get('q');
                if (qVal) qDecoded = Buffer.from(qVal, 'base64').toString('utf8');
            } catch (_) {}
        }

        const combinedText = `${text} ${parentText} ${precedingHeading} ${qDecoded}`.toLowerCase();

        if (href.includes('gadgetsweb') || href.includes('hblinks') || href.includes('hubcloud') || href.includes('hubcdn')) {
            const epMatch = combinedText.match(/\bep(?:isode)?\s*(\d+)\b/i);

            if (epMatch) {
                const epNum = parseInt(epMatch[1], 10);
                // Filter for 720p
                if (combinedText.includes('720p') || (!combinedText.includes('1080p') && !combinedText.includes('480p'))) {
                    seenLinks.add(href);
                    episodeLinks.push({
                        epNum,
                        epLabel: `E${String(epNum).padStart(2, '0')}`,
                        href,
                        text
                    });
                }
            }
        }
    });

    episodeLinks.sort((a, b) => a.epNum - b.epNum);
    console.log(`Found ${episodeLinks.length} episode link(s) for 720p:\n`);

    const resolvedMap = new Map();
    for (const ep of episodeLinks) {
        if (resolvedMap.has(ep.epLabel)) continue; // Keep first working server per episode
        process.stdout.write(`Resolving ${ep.epLabel}... `);
        const direct = await resolveDirectLink(ep.href);
        if (direct && direct.startsWith('http')) {
            console.log(`✅ ${direct.substring(0, 80)}...`);
            resolvedMap.set(ep.epLabel, direct);
        } else {
            console.log(`❌ Failed`);
        }
    }

    console.log('\n=== FINAL WHATSAPP BOT COMMAND ===\n');
    const cmdParts = [];
    resolvedMap.forEach((url, epLabel) => {
        cmdParts.push(`Trigger S01${epLabel} 720p = ${url}`);
    });
    console.log(`.d ${cmdParts.join(', ')}`);
}

testTriggerFullSeries();
