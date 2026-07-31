const axios = require('axios');
const cheerio = require('cheerio');

async function dumpDom(url) {
    console.log(`\n=== DUMP DOM: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        // Print all class names of top level divs under body / #content
        const classes = new Set();
        $('div').each((_, el) => {
            const cls = $(el).attr('class');
            if (cls) cls.split(' ').forEach(c => classes.add(c));
        });
        console.log('Div classes:', Array.from(classes).filter(c => c.includes('post') || c.includes('card') || c.includes('grid') || c.includes('item') || c.includes('content')));

        // Check links inside #content or main
        const mainLinks = $('#content a[href], main a[href], .site-main a[href], body a[href]');
        console.log(`Total links in main: ${mainLinks.length}`);
        
        const posts = [];
        mainLinks.each((_, el) => {
            const href = $(el).attr('href') || '';
            const img = $(el).find('img').first();
            if (img.length > 0 && href.includes('/download-')) {
                const alt = img.attr('alt') || $(el).attr('title') || $(el).text().trim();
                const src = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
                posts.push({ alt, href, src });
            }
        });
        
        console.log(`Found ${posts.length} movie post links!`);
        posts.slice(0, 5).forEach((p, i) => {
            console.log(`[${i+1}] Title: "${p.alt}"\n    Href: ${p.href}\n    Img:  ${p.src}`);
        });
    } catch (e) {
        console.error(e.message);
    }
}

async function run() {
    await dumpDom('https://vegamovies.catering');
    await dumpDom('https://rogmovies.rest');
}
run();
