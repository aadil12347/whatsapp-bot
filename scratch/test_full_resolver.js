const axios = require('axios');
const cheerio = require('cheerio');

async function resolveFullChain(landingUrl) {
    console.log(`\n=== Testing Full Chain Resolution: ${landingUrl} ===`);
    try {
        // Step 1: Fetch initial page (e.g. nexdrive.fit)
        let html = await fetchHtml(landingUrl);
        let $ = cheerio.load(html);

        let vcloudUrl = '';
        $('a[href]').each((i, el) => {
            const href = $(el).attr('href') || '';
            if (href.toLowerCase().includes('vcloud')) {
                vcloudUrl = href;
            }
        });

        if (!vcloudUrl) {
            console.log('No vcloud link found in initial page');
            return;
        }

        console.log('Step 1: Found VCloud Landing Link:', vcloudUrl);

        // Step 2: Fetch VCloud landing page
        const vhtml = await fetchHtml(vcloudUrl, landingUrl);
        const v$ = cheerio.load(vhtml);

        // Search for double atob
        let tokenUrl = '';
        v$('script').each((i, el) => {
            const txt = v$(el).html() || '';
            const match = txt.match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
            if (match) {
                try {
                    const s1 = Buffer.from(match[1], 'base64').toString('utf-8');
                    tokenUrl = Buffer.from(s1, 'base64').toString('utf-8');
                } catch (_) {}
            }
        });

        if (!tokenUrl) {
            console.log('No double atob script found');
            return;
        }

        console.log('Step 2: Decoded Token URL:', tokenUrl);

        // Step 3: Fetch VCloud token page
        const thtml = await fetchHtml(tokenUrl, vcloudUrl);
        const t$ = cheerio.load(thtml);

        const servers = [];
        t$('a[href]').each((i, el) => {
            const href = t$(el).attr('href') || '';
            const text = t$(el).text().trim();
            if (href && !text.toLowerCase().includes('login') && !href.includes('telegram') && !href.includes('google.com')) {
                servers.push({ text, href });
            }
        });

        console.log('\nStep 3: Extracted Direct Server Options:');
        servers.forEach(s => console.log(`  - [${s.text}] -> ${s.href}`));

    } catch (e) {
        console.error('Full chain resolution failed:', e.message);
    }
}

async function fetchHtml(url, referer) {
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...(referer ? { Referer: referer } : {})
        },
        timeout: 15000
    });
    return res.data;
}

resolveFullChain('https://nexdrive.fit/genxfm784776499361/');
