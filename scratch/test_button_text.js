const axios = require('axios');
const cheerio = require('cheerio');

async function testButtonTexts(url) {
    console.log(`\n=== Testing Anchor Button Text Extraction: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);

        const content = $('.entry-content, article, #main-content').first();
        
        content.find('a[href]').each((i, el) => {
            const href = $(el).attr('href') || '';
            const lowerHref = href.toLowerCase();
            const isLanding = ['nexdrive', 'vgmlink', 'gdflix', 'fastdl', 'filebee', 'hubcloud', 'vcloud', 'katdrive', 'kmhd'].some(d => lowerHref.includes(d));
            
            if (!isLanding) return;

            const buttonRawText = $(el).text().trim();
            const parentText = $(el).parent().text().trim();

            let headingText = '';
            let prev = $(el).parent();
            while (prev.length && !headingText) {
                let sib = prev.prev();
                while (sib.length) {
                    const txt = sib.text().trim();
                    if (txt && (txt.includes('480p') || txt.includes('720p') || txt.includes('1080p') || txt.includes('2160p') || txt.includes('4k') || txt.includes('Download') || /^h[1-6]$/i.test(sib[0].name))) {
                        headingText = txt;
                        break;
                    }
                    sib = sib.prev();
                }
                prev = prev.parent();
            }

            console.log(`\n[Download Button ${i+1}]`);
            console.log(`  Button Anchor Text: "${buttonRawText}"`);
            console.log(`  Preceding Heading:  "${headingText}"`);
            console.log(`  Target Href:        ${href}`);
        });

    } catch (e) {
        console.error('Test button text failed:', e.message);
    }
}

testButtonTexts('https://vegamovies.catering/download-spider-man-brand-new-day-2026/');
