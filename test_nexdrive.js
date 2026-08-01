const axios = require('axios');
const cheerio = require('cheerio');

async function testNexdrive10Gbps() {
    const landingUrl = 'https://nexdrive.fit/genxfm784776495266/';
    console.log(`Fetching landing page: ${landingUrl}`);

    const res = await axios.get(landingUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://vegamovies.im/'
        }
    });

    const $ = cheerio.load(res.data);
    const vcloudLinks = [];

    $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('vcloud')) {
            if (!vcloudLinks.includes(href)) vcloudLinks.push(href);
        }
    });

    console.log(`Found ${vcloudLinks.length} VCloud Links on Landing Page:`);
    vcloudLinks.forEach((link, idx) => console.log(`Ep ${idx + 1}: ${link}`));

    for (let i = 0; i < vcloudLinks.length; i++) {
        const vUrl = vcloudLinks[i];
        console.log(`\n--- EPISODE ${i + 1} (${vUrl}) ---`);
        try {
            const vRes = await axios.get(vUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                    'Referer': landingUrl
                }
            });

            const atobMatch = vRes.data.match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
            if (atobMatch) {
                const s1 = Buffer.from(atobMatch[1], 'base64').toString('utf8');
                const tokenUrl = Buffer.from(s1, 'base64').toString('utf8');
                const fullTokenUrl = tokenUrl.startsWith('http') ? tokenUrl : `https://${new URL(vUrl).host}${tokenUrl.startsWith('/') ? '' : '/'}${tokenUrl}`;
                
                const dlRes = await axios.get(fullTokenUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                        'Referer': vUrl
                    }
                });

                const $$ = cheerio.load(dlRes.data);
                const servers = [];
                $$('a[href]').each((_, a) => {
                    const h = $$(a).attr('href');
                    const text = $$(a).text().trim();
                    if (h && (h.startsWith('http') || h.startsWith('/'))) {
                        if (!h.includes('telegram') && !h.includes('.fans') && text) {
                            servers.push({ text, href: h });
                        }
                    }
                });

                console.log(`Servers found for Ep ${i + 1}:`);
                servers.forEach(s => console.log(`  - [${s.text}] -> ${s.href}`));

                // Pick 10Gbps first
                const preferred = servers.find(s => {
                    const t = `${s.text} ${s.href}`.toLowerCase();
                    return t.includes('10gbps') || t.includes('g-direct') || t.includes('gdirect');
                }) || servers.find(s => s.text.toLowerCase().includes('fslv2')) || servers[0];

                console.log(`🎯 SELECTED (10Gbps Priority): [${preferred?.text}] -> ${preferred?.href}`);
            }
        } catch (err) {
            console.log(`❌ Error: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

testNexdrive10Gbps();
