const axios = require('axios');
const cheerio = require('cheerio');

async function test10gbpsFullChain() {
    console.log('=== Step 1: Requesting Nexdrive Page ===');
    const nexdriveUrl = 'https://nexdrive.fit/genxfm784776499361/';
    const nexHtml = await fetchHtml(nexdriveUrl);
    const nex$ = cheerio.load(nexHtml);

    let vcloudUrl = '';
    nex$('a[href]').each((i, el) => {
        const href = nex$(el).attr('href') || '';
        if (href.toLowerCase().includes('vcloud')) {
            vcloudUrl = href;
        }
    });

    console.log('Found VCloud Link:', vcloudUrl);

    console.log('\n=== Step 2: Requesting VCloud Landing Page ===');
    const vHtml = await fetchHtml(vcloudUrl, nexdriveUrl);
    const v$ = cheerio.load(vHtml);

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

    console.log('Decoded Token URL:', tokenUrl);

    console.log('\n=== Step 3: Requesting VCloud Token Page ===');
    const tHtml = await fetchHtml(tokenUrl, vcloudUrl);
    const t$ = cheerio.load(tHtml);

    let hubcloud10gbpsUrl = '';
    t$('a[href]').each((i, el) => {
        const text = t$(el).text().trim();
        const href = t$(el).attr('href') || '';
        if (text.includes('10Gbps') || href.includes('hubcloud.cx')) {
            hubcloud10gbpsUrl = href;
        }
    });

    console.log('Found 10Gbps Link:', hubcloud10gbpsUrl);

    console.log('\n=== Step 4: Investigating 10Gbps HubCloud URL ===');
    const hRes = await axios.get(hubcloud10gbpsUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': tokenUrl
        },
        maxRedirects: 10,
        timeout: 15000
    });

    console.log('Final URL after 10Gbps GET:', hRes.request.res.responseUrl || hRes.config.url);
    console.log('Response Status:', hRes.status);
    
    const h$ = cheerio.load(hRes.data);
    console.log('Page Title:', h$('title').text().trim());

    // Extract all anchors and scripts on final page
    console.log('\nAnchors on 10Gbps final page:');
    h$('a[href]').each((i, el) => {
        console.log(`  Anchor ${i+1}: [${h$(el).text().trim()}] -> ${h$(el).attr('href')}`);
    });

    console.log('\nScripts on 10Gbps final page:');
    h$('script').each((i, el) => {
        const txt = h$(el).html() || '';
        if (txt.includes('url') || txt.includes('location') || txt.includes('atob') || txt.includes('http')) {
            console.log(`  Script ${i+1}:`, txt.substring(0, 300));
        }
    });
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

test10gbpsFullChain();
