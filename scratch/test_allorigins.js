const axios = require('axios');
const cheerio = require('cheerio');

async function testAllorigins() {
    const targetUrl = 'https://vcloud.zip/mrg9sjg5ec1nuze';
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    console.log('Fetching via allorigins:', proxyUrl);

    try {
        const res = await axios.get(proxyUrl, { timeout: 15000 });
        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        console.log('Status:', res.status, 'HTML len:', html.length);
        console.log('Snippet:', html.substring(0, 300));

        const $ = cheerio.load(html);
        const scriptContent = $('script').text() || '';
        console.log('Script Content length:', scriptContent.length);

        const atobRegex = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
        let match = atobRegex.exec(scriptContent);
        if (match && match[1]) {
            console.log('Matched atob token:', match[1]);
            const step1 = Buffer.from(match[1], 'base64').toString('utf8');
            const decoded = Buffer.from(step1, 'base64').toString('utf8');
            console.log('Decoded Token URL:', decoded);
        } else {
            console.log('atobRegex match failed!');
            const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
            let m = varUrlRegex.exec(scriptContent);
            if (m) console.log('Found var url:', m[1]);
            else console.log('No atob or var url match found in script content!');
        }
    } catch (e) {
        console.error('Allorigins test failed:', e.message);
    }
}

testAllorigins();
