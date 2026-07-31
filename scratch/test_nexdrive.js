const axios = require('axios');
const cheerio = require('cheerio');

async function testNexdrive(url) {
    console.log(`\n=== Testing Nexdrive Link Resolution: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);

        console.log('Nexdrive Page Title:', $('title').text().trim());

        const links = [];
        $('a[href]').each((i, el) => {
            links.push({
                text: $(el).text().trim(),
                href: $(el).attr('href')
            });
        });

        console.log('Found Links on Nexdrive:', links);

        // Check for scripts / atob / redirect
        $('script').each((i, el) => {
            const txt = $(el).html();
            if (txt && (txt.includes('atob') || txt.includes('url') || txt.includes('location'))) {
                console.log(`\nScript ${i+1}:`, txt.substring(0, 300));
            }
        });

    } catch (e) {
        console.error('Nexdrive test failed:', e.message);
    }
}

testNexdrive('https://nexdrive.fit/genxfm784776499361/');
