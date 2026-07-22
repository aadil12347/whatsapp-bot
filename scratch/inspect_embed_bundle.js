const puppeteer = require('puppeteer');

(async () => {
    console.log('Launching Puppeteer with object/PDF bypass...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Bypass anti-headless / anti-sandbox checks
    await page.evaluateOnNewDocument(() => {
        // Prevent location.href = /asb.html
        let originalLocation = window.location;
        const origCreateElement = document.createElement.bind(document);
        document.createElement = function(tagName, options) {
            const el = origCreateElement(tagName, options);
            if (tagName.toLowerCase() === 'object') {
                setTimeout(() => {
                    if (el.onload) el.onload();
                }, 10);
            }
            return el;
        };

        const fakePlugin = { name: 'Chrome PDF Viewer' };
        const fakePlugins = [fakePlugin];
        fakePlugins['namedItem'] = (name) => name === 'Chrome PDF Viewer' ? fakePlugin : null;
        Object.defineProperty(navigator, 'plugins', { get: () => fakePlugins });
    });

    const networkLogs = [];
    page.on('request', req => {
        const url = req.url();
        const type = req.resourceType();
        if (!url.includes('histats') && !url.includes('google')) {
            console.log(`[REQ] [${type}] ${url}`);
            networkLogs.push({ type, url });
        }
    });

    page.on('response', async res => {
        const url = res.url();
        if (url.includes('.m3u8') || url.includes('/api/') || url.includes('player') || url.includes('embed') || url.includes('.mp4') || url.includes('vidsrc') || url.includes('vidplay') || url.includes('autoembed')) {
            console.log(`[MATCH RES] [${res.status()}] ${url}`);
        }
    });

    console.log('Navigating to embed page...');
    try {
        await page.goto('https://streamimdb.ru/embed/movie/1284465', { waitUntil: 'networkidle2', timeout: 20000 });
    } catch(e) {
        console.log('Navigation ended:', e.message);
    }

    await new Promise(r => setTimeout(r, 4000));

    const pageData = await page.evaluate(() => {
        return {
            title: document.title,
            location: window.location.href,
            iframes: Array.from(document.querySelectorAll('iframe')).map(i => i.src),
            videos: Array.from(document.querySelectorAll('video')).map(v => v.src || Array.from(v.querySelectorAll('source')).map(s => s.src)),
            scripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean)
        };
    });

    console.log('\n--- Result Page Data ---');
    console.log(JSON.stringify(pageData, null, 2));

    await browser.close();
})();
