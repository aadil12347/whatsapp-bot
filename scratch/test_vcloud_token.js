const axios = require('axios');
const cheerio = require('cheerio');

async function testVCloudToken(url) {
    console.log(`\n=== Testing VCloud Token Page: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://vcloud.zip/bpsn7p1botth7dv'
            },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);

        console.log('VCloud Token Page Title:', $('title').text().trim());

        const links = [];
        $('a[href]').each((i, el) => {
            links.push({
                text: $(el).text().trim(),
                href: $(el).attr('href')
            });
        });

        console.log('Found Server Download Links on VCloud Token Page:', links);

    } catch (e) {
        console.error('VCloud Token test failed:', e.message);
    }
}

testVCloudToken('https://vcloud.zip/bpsn7p1botth7dv?token=Zmp2NEMwRnF5SDZSTGNVdFN1UStwNFpkUzAyb1dNUlNnSlpXSFcrY0Y2Zz0=');
