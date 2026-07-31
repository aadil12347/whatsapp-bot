const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const browserHttpsAgent = new https.Agent({
    ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384'
    ].join(':'),
    honorCipherOrder: true,
    minVersion: 'TLSv1.2'
});

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

function decodeDoubleAtob(str) {
    try {
        const step1 = Buffer.from(str, 'base64').toString('utf8');
        return Buffer.from(step1, 'base64').toString('utf8');
    } catch (e) {
        return null;
    }
}

async function resolveElink(targetUrl, refererUrl = null) {
    let currentUrl = targetUrl;
    console.log(`1️⃣ Fetching link page: ${currentUrl}`);

    const reqHeaders = { ...HEADERS };
    if (refererUrl) reqHeaders['Referer'] = refererUrl;

    let htmlContent = '';
    try {
        const res = await axios.get(currentUrl, {
            headers: reqHeaders,
            httpsAgent: browserHttpsAgent,
            timeout: 15000,
            validateStatus: status => status >= 200 && status < 400
        });
        htmlContent = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err) {
        console.warn(`⚠️ Direct fetch failed (${err.message}). Trying domain mirrors...`);
        const domain = new URL(currentUrl).hostname.toLowerCase();
        const mirrors = ['vcloud.zip', 'vcloud.lol', 'hubcloud.link', 'hubcloud.club', 'fastdl.zip'];
        for (const mirror of mirrors) {
            if (domain.includes(mirror)) continue;
            const mirrorUrl = currentUrl.replace(domain, mirror);
            try {
                console.log(`   Trying mirror: ${mirrorUrl}`);
                const mRes = await axios.get(mirrorUrl, { headers: reqHeaders, httpsAgent: browserHttpsAgent, timeout: 10000 });
                const mBody = typeof mRes.data === 'string' ? mRes.data : JSON.stringify(mRes.data);
                if (mBody && (mBody.includes('atob(') || mBody.includes('download'))) {
                    htmlContent = mBody;
                    currentUrl = mirrorUrl;
                    console.log(`✅ Mirror fetch succeeded!`);
                    break;
                }
            } catch (e) {}
        }
    }

    if (!htmlContent) {
        console.error('❌ Could not fetch content from link page.');
        return null;
    }

    let decodedLink = null;

    // Pattern 1: Double base64 atob
    const atobRegex = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
    const matchAtob = atobRegex.exec(htmlContent);
    if (matchAtob && matchAtob[1]) {
        decodedLink = decodeDoubleAtob(matchAtob[1]);
        if (decodedLink) console.log(`✅ Decoded double-atob link: ${decodedLink}`);
    }

    // Pattern 2: var url = '...'
    if (!decodedLink) {
        const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
        const matchVar = varUrlRegex.exec(htmlContent);
        if (matchVar && matchVar[1]) {
            decodedLink = matchVar[1];
            console.log(`✅ Found var url link: ${decodedLink}`);
        }
    }

    // Pattern 3: FastDL reurl
    if (!decodedLink) {
        const reurlRegex = /reurl\s*=\s*['"]([^'"]+)['"]/i;
        const matchReurl = reurlRegex.exec(htmlContent);
        if (matchReurl && matchReurl[1]) {
            const reurl = matchReurl[1];
            try {
                const parsed = new URL(reurl);
                const linkParam = parsed.searchParams.get('link');
                if (linkParam) {
                    decodedLink = linkParam;
                    console.log(`✅ Found reurl direct link: ${decodedLink}`);
                }
            } catch (e) {}
        }
    }

    let landingHtml = htmlContent;
    let landingUrl = currentUrl;

    if (decodedLink) {
        if (!decodedLink.startsWith('http')) {
            const parsed = new URL(currentUrl);
            landingUrl = `${parsed.protocol}//${parsed.host}${decodedLink.startsWith('/') ? '' : '/'}${decodedLink}`;
        } else {
            landingUrl = decodedLink;
        }

        console.log(`2️⃣ Fetching landing download options page: ${landingUrl}`);
        try {
            const dlRes = await axios.get(landingUrl, { headers: reqHeaders, httpsAgent: browserHttpsAgent, timeout: 15000 });
            landingHtml = typeof dlRes.data === 'string' ? dlRes.data : JSON.stringify(dlRes.data);
        } catch (e) {
            console.error(`❌ Failed to fetch landing options page: ${e.message}`);
            return null;
        }
    }

    const $ = cheerio.load(landingHtml);
    const subOptions = [];

    $('a[href]').each((_, el) => {
        let href = $(el).attr('href')?.trim();
        let text = $(el).text().trim();
        if (!href || href === '#' || href.startsWith('javascript:')) return;

        if (href.startsWith('/')) {
            const parsedL = new URL(landingUrl);
            href = `${parsedL.protocol}//${parsedL.host}${href}`;
        }

        const lowerText = text.toLowerCase();
        const lowerHref = href.toLowerCase();

        const keywords = ['fsl', 'gdrive', 'drive', 'pixel', '10gbps', 'mega', 'download', 'buzz', 'fastdl', 'filebee', 'stream'];
        if (keywords.some(kw => lowerText.includes(kw) || lowerHref.includes(kw))) {
            if (!subOptions.some(opt => opt.url === href)) {
                subOptions.push({ text: text || 'Download Server', url: href });
            }
        }
    });

    console.log(`\n3️⃣ Found ${subOptions.length} server sub-option(s):`);
    const results = [];

    for (let i = 0; i < subOptions.length; i++) {
        const opt = subOptions[i];
        const srvName = opt.text;
        let srvUrl = opt.url;
        let finalDirectUrl = srvUrl;

        // Server-specific resolutions
        if (srvName.toLowerCase().includes('10gbps') || srvName.toLowerCase().includes('10 gbps')) {
            try {
                const headRes = await axios.head(srvUrl, { headers: HEADERS, httpsAgent: browserHttpsAgent, maxRedirects: 5, timeout: 10000 });
                const finalUrl = headRes.request.res.responseUrl || srvUrl;
                if (finalUrl.includes('link=')) {
                    const parsed = new URL(finalUrl);
                    const link = parsed.searchParams.get('link');
                    if (link) finalDirectUrl = decodeURIComponent(link);
                }
            } catch (e) {}
        } else if (srvName.toLowerCase().includes('buzzserver')) {
            try {
                const buzzRes = await axios.get(`${srvUrl}/download`, {
                    headers: { ...HEADERS, Referer: srvUrl },
                    httpsAgent: browserHttpsAgent,
                    maxRedirects: 0,
                    validateStatus: status => status >= 200 && status < 400
                });
                const hxRedirect = buzzRes.headers['hx-redirect'];
                if (hxRedirect) {
                    if (hxRedirect.startsWith('http')) {
                        finalDirectUrl = hxRedirect;
                    } else {
                        const parsedB = new URL(srvUrl);
                        finalDirectUrl = `${parsedB.protocol}//${parsedB.host}${hxRedirect}`;
                    }
                }
            } catch (e) {
                if (e.response?.headers?.['hx-redirect']) {
                    const hxRedirect = e.response.headers['hx-redirect'];
                    const parsedB = new URL(srvUrl);
                    finalDirectUrl = hxRedirect.startsWith('http') ? hxRedirect : `${parsedB.protocol}//${parsedB.host}${hxRedirect}`;
                }
            }
        } else if (finalDirectUrl.includes('pixeldrain.com/u/')) {
            const id = finalDirectUrl.split('/u/')[1].split('?')[0];
            finalDirectUrl = `https://pixeldrain.com/api/file/${id}?download`;
        }

        results.push({
            index: i + 1,
            server: srvName,
            initial_url: srvUrl,
            direct_url: finalDirectUrl
        });

        console.log(`   [${i + 1}] ${srvName}\n       ➜ ${finalDirectUrl}`);
    }

    return results;
}

const targetUrl = process.argv[2] || 'https://vcloud.zip/mrg9sjg5ec1nuze';
console.log(`🚀 ELINK / VCLOUD EXTRACTOR starting for URL:\n${targetUrl}\n`);
resolveElink(targetUrl).then(res => {
    console.log('\n✨ Extraction Complete! Output JSON:');
    console.log(JSON.stringify(res, null, 2));
}).catch(err => {
    console.error('Fatal error:', err);
});
