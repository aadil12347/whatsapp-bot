const puppeteer = require('puppeteer');

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const logs = [];
    page.on('request', req => {
        const url = req.url();
        const resourceType = req.resourceType();
        if (!url.includes('googleads') && !url.includes('histats') && !url.includes('cloudflare')) {
            console.log(`[REQ] [${resourceType}] ${url}`);
            logs.push({ type: 'REQ', resourceType, url });
        }
    });

    page.on('response', async res => {
        const url = res.url();
        if (url.includes('embed') || url.includes('/api/') || url.includes('player') || url.includes('.m3u8')) {
            console.log(`[RES] [${res.status()}] ${url}`);
        }
    });

    console.log('Navigating to streamimdb movie page...');
    await page.goto('https://streamimdb.ru/movie/7n6r3-the-death-of-robin-hood', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Page loaded. Checking embed buttons / player elements...');
    
    const info = await page.evaluate(() => {
        const playBtns = Array.from(document.querySelectorAll('.cb-btn-play, [data-embed], .player-servers button, #player-servers option, .server-item')).map(b => ({
            text: b.innerText,
            embed: b.getAttribute('data-embed') || b.getAttribute('data-src') || b.getAttribute('data-link') || b.value,
            id: b.id,
            class: b.className
        }));

        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean);
        const iframes = Array.from(document.querySelectorAll('iframe')).map(i => i.src);

        return { playBtns, scripts, iframes };
    });

    console.log('Initial page elements:', JSON.stringify(info, null, 2));

    // Try clicking play button if found
    const playBtnHandle = await page.$('.cb-btn-play, [data-embed]');
    if (playBtnHandle) {
        console.log('Clicking play button...');
        await playBtnHandle.click();
        await new Promise(r => setTimeout(r, 4000));
    }

    const afterClickInfo = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe')).map(i => i.src);
        const playerModalSrc = document.querySelector('#cbModalPlayer')?.src;
        return { iframes, playerModalSrc };
    });

    console.log('After play click info:', JSON.stringify(afterClickInfo, null, 2));

    // Now test directly opening the embed URL: https://streamimdb.ru/embed/movie/1284465
    console.log('\n--- Direct Embed Test: https://streamimdb.ru/embed/movie/1284465 ---');
    const embedPage = await browser.newPage();
    await embedPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    embedPage.on('request', req => {
        const url = req.url();
        const type = req.resourceType();
        if (!url.includes('google') && !url.includes('histats')) {
            console.log(`[EMBED REQ] [${type}] ${url}`);
        }
    });

    embedPage.on('response', async res => {
        const url = res.url();
        if (url.includes('embed') || url.includes('/api/') || url.includes('player') || url.includes('.m3u8') || url.includes('.mp4')) {
            console.log(`[EMBED RES] [${res.status()}] ${url}`);
        }
    });

    await embedPage.goto('https://streamimdb.ru/embed/movie/1284465', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 5000));

    const embedInfo = await embedPage.evaluate(() => {
        return {
            title: document.title,
            bodyHTML: document.body.innerHTML.substring(0, 1000),
            iframes: Array.from(document.querySelectorAll('iframe')).map(i => i.src),
            scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.substring(0, 200))
        };
    });

    console.log('Embed Page Info:', JSON.stringify(embedInfo, null, 2));

    await browser.close();
})();
