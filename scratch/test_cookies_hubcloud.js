const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function testWithCookies() {
    const landingUrl = 'https://vcloud.fit/5gy6ff6qqbrq-kr';
    console.log(`Step 1: Fetching initial page: ${landingUrl}`);

    const client = axios.create({
        httpsAgent: browserHttpsAgent,
        withCredentials: true
    });

    let cookies = [];

    const res1 = await client.get(landingUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
    });

    if (res1.headers['set-cookie']) {
        cookies = cookies.concat(res1.headers['set-cookie']);
        console.log(`Cookies from step 1:`, res1.headers['set-cookie']);
    }

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

    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

    console.log(`Step 3: Fetching Token Page with Cookie header...`);
    const res2 = await client.get(tokenUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': landingUrl,
            'Cookie': cookieHeader
        }
    });

    if (res2.headers['set-cookie']) {
        cookies = cookies.concat(res2.headers['set-cookie']);
        console.log(`Cookies after step 2:`, res2.headers['set-cookie']);
    }

    const cookieHeader2 = cookies.map(c => c.split(';')[0]).join('; ');

    const $2 = cheerio.load(res2.data);
    const hubcloudLinks = [];
    $2('a[href]').each((_, el) => {
        const href = $2(el).attr('href');
        const txt = $2(el).text().trim();
        if (href && (href.includes('hubcloud') || href.includes('10gbps') || href.includes('fsl'))) {
            hubcloudLinks.push({ txt, href });
        }
    });

    if (hubcloudLinks.length === 0) {
        console.log(`No host links found on token page.`);
        return;
    }

    const targetHost = hubcloudLinks[0].href;
    console.log(`\nStep 4: Fetching final hubcloud host page: ${targetHost}...`);

    // Try multiple referer/cookie combinations for gpdl2.hubcloud.cx
    const referersToTest = [
        tokenUrl,
        landingUrl,
        'https://vcloud.fit/',
        'https://hubcloud.cx/'
    ];

    for (const ref of referersToTest) {
        try {
            console.log(`Testing Referer: ${ref}`);
            const res3 = await axios.get(targetHost, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': ref,
                    'Cookie': cookieHeader2
                },
                httpsAgent: browserHttpsAgent
            });

            console.log(`SUCCESS with referer ${ref}! Status: ${res3.status}`);
            const $3 = cheerio.load(res3.data);
            console.log(`Title: ${$3('title').text()}`);
            $3('a').each((i, el) => {
                console.log(`Link ${i}: [${$3(el).text().trim()}] -> ${$3(el).attr('href')}`);
            });
            break;
        } catch (err3) {
            console.error(`Failed with referer ${ref}: ${err3.message} (status: ${err3.response?.status})`);
        }
    }
}

testWithCookies();
