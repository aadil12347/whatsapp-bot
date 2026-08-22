const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function testTokenFlow() {
    const landingUrl = 'https://vcloud.fit/5gy6ff6qqbrq-kr';
    console.log(`Step 1: Fetching initial page: ${landingUrl}`);

    const res1 = await axios.get(landingUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        httpsAgent: browserHttpsAgent
    });

    const $1 = cheerio.load(res1.data);
    let tokenUrl = null;
    $1('script').each((_, el) => {
        const txt = $1(el).text();
        const atobMatch = txt.match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
        if (atobMatch && atobMatch[1]) {
            try {
                const step1 = Buffer.from(atobMatch[1], 'base64').toString('utf8');
                tokenUrl = Buffer.from(step1, 'base64').toString('utf8');
            } catch (e) {}
        }
    });

    console.log(`Step 2: Decoded Token URL: ${tokenUrl}`);
    if (!tokenUrl) return;

    console.log(`Step 3: Fetching Token Page with referer ${landingUrl}...`);
    const res2 = await axios.get(tokenUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': landingUrl,
            'Origin': 'https://vcloud.fit'
        },
        httpsAgent: browserHttpsAgent
    });

    const $2 = cheerio.load(res2.data);
    console.log(`Token Page Title: ${$2('title').text()}`);

    const hubcloudLinks = [];
    $2('a[href]').each((_, el) => {
        const href = $2(el).attr('href');
        const txt = $2(el).text().trim();
        if (href && (href.includes('hubcloud') || href.includes('10gbps') || href.includes('fsl'))) {
            hubcloudLinks.push({ txt, href });
        }
    });

    console.log(`Found ${hubcloudLinks.length} host link(s) on token page:`);
    console.log(JSON.stringify(hubcloudLinks, null, 2));

    if (hubcloudLinks.length > 0) {
        const targetHost = hubcloudLinks[0].href;
        console.log(`\nStep 4: Fetching final hubcloud host page: ${targetHost}...`);
        try {
            const res3 = await axios.get(targetHost, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': tokenUrl,
                    'Origin': 'https://vcloud.fit'
                },
                httpsAgent: browserHttpsAgent
            });

            console.log(`Host Page Status: ${res3.status}`);
            console.log(`Host Page Length: ${res3.data.length}`);
            const $3 = cheerio.load(res3.data);
            console.log(`Host Page Title: ${$3('title').text()}`);

            $3('a').each((i, el) => {
                console.log(`Host Link ${i}: [${$3(el).text().trim()}] -> ${$3(el).attr('href')}`);
            });
        } catch (err3) {
            console.error(`Host page failed:`, err3.message);
        }
    }
}

testTokenFlow();
