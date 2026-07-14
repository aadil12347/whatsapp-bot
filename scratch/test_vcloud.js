const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

async function test() {
    const url = 'https://vcloud.zip/uqyqu5ul4l5ddry';
    console.log('Fetching:', url);
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        console.log('Status:', res.status);
        const $ = cheerio.load(res.data);
        console.log('Page Title:', $('title').text());
        
        const scriptContent = $('script').text() || '';
        console.log('Script content length:', scriptContent.length);
        
        let decodedLink = null;
        const atobRegex = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
        let match = atobRegex.exec(scriptContent);
        if (match && match[1]) {
            const step1 = Buffer.from(match[1], 'base64').toString('utf8');
            decodedLink = Buffer.from(step1, 'base64').toString('utf8');
            console.log('Decoded double-atob link:', decodedLink);
        }

        // Fallback: var url = '...'
        if (!decodedLink) {
            const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
            const matchVar = varUrlRegex.exec(scriptContent);
            if (matchVar && matchVar[1]) {
                decodedLink = matchVar[1];
                console.log('Decoded var url link:', decodedLink);
            }
        }

        if (decodedLink) {
            let finalUrl = decodedLink;
            if (!finalUrl.startsWith('http')) {
                const parsed = new URL(url);
                finalUrl = `${parsed.protocol}//${parsed.host}${finalUrl.startsWith('/') ? '' : '/'}${finalUrl}`;
            }
            console.log('Final target URL:', finalUrl);
            
            // Let's fetch final target URL
            const dlRes = await axios.get(finalUrl, { headers: HEADERS, timeout: 10000 });
            const dl$ = cheerio.load(dlRes.data);
            console.log('Final download page title:', dl$('title').text());
            
            console.log('All download buttons on final page:');
            dl$('a.btn, h2 a.btn, a').each((i, el) => {
                const href = dl$(el).attr('href');
                const text = dl$(el).text().trim();
                if (href) {
                    console.log(`Text: "${text}", href: "${href}"`);
                }
            });
        }
    } catch (e) {
        console.error('Error fetching:', e.message);
    }
}

test();
