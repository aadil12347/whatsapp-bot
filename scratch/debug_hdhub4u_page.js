const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
};

async function inspectPage(url) {
    console.log(`Fetching HTML from ${url}...`);
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
        const $ = cheerio.load(res.data);

        console.log(`Page Title: "${$('title').text().trim()}"`);
        console.log(`H1: "${$('h1').text().trim()}"`);

        console.log('\n--- ALL LINKS INSIDE MAIN ENTRY CONTENT ---');
        const contentSelector = 'main.page-body, .page-body, .entry-content, #main-content, div.content-kuss, div.content-area';

        const links = [];
        $(contentSelector).find('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            const parentText = $(el).parent().text().trim();

            let precedingHeading = '';
            let prev = $(el).closest('p, div, h4, h3, h2').prev();
            let count = 0;
            while (prev.length && count < 5) {
                const t = prev.text().trim();
                if (t) { precedingHeading = t; break; }
                prev = prev.prev();
                count++;
            }

            links.push({ idx: i + 1, text, href, parentText: parentText.substring(0, 100), precedingHeading: precedingHeading.substring(0, 100) });
        });

        console.log(`Total content links found: ${links.length}`);
        links.forEach(l => {
            console.log(`\n[Link ${l.idx}] Text: "${l.text}"`);
            console.log(`   Href: ${l.href}`);
            console.log(`   Parent: "${l.parentText}"`);
            console.log(`   Heading: "${l.precedingHeading}"`);
        });

    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

inspectPage('https://new3.hdhub4u.cl/trigger-season-1-webrip-hindi-full-series/');
