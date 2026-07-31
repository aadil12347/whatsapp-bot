const axios = require('axios');
const cheerio = require('cheerio');

async function testDetailPage(url) {
    console.log(`\n=== Testing Detail Page: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);

        console.log('Title:', $('title').text().trim());

        const links = [];
        const contentSelectors = '.entry-content, article, #main-content, div.content-kuss, div.content-area';
        
        $(contentSelectors).find('a[href]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            const parentText = $(el).parent().text().trim();
            const prevText = $(el).closest('p, div, h1, h2, h3, h4, h5, h6').prev().text().trim();
            
            if (!href || href === '/' || href.startsWith('#') || href.includes('imdb.com') || href.includes('telegram')) return;
            
            links.push({
                index: i + 1,
                text: text || 'NO_TEXT',
                href: href,
                parentSnippet: parentText.substring(0, 80),
                prevSnippet: prevText.substring(0, 80)
            });
        });

        console.log(`Extracted ${links.length} links inside post content:`);
        links.forEach((l) => {
            console.log(`\n[Link ${l.index}] Text: "${l.text}"`);
            console.log(`          Href: ${l.href}`);
            console.log(`        Parent: "${l.parentSnippet}"`);
        });

    } catch (e) {
        console.error('Detail fetch failed:', e.message);
    }
}

testDetailPage('https://vegamovies.catering/download-spider-man-brand-new-day-2026/');
