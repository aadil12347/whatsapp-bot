const axios = require('axios');
const cheerio = require('cheerio');

async function testHubcloudFans(url) {
    console.log(`\n=== Testing Hubcloud Fans Page: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://vcloud.zip/'
            },
            maxRedirects: 5
        });
        const $ = cheerio.load(res.data);
        console.log('Hubcloud Fans Title:', $('title').text().trim());

        $('a[href]').each((i, el) => {
            console.log(`  Link ${i+1}: [${$(el).text().trim()}] -> ${$(el).attr('href')}`);
        });

    } catch (e) {
        console.error('Hubcloud Fans test error:', e.message);
    }
}

testHubcloudFans('https://hubcloud.fans/video/bpsn7p1botth7dv');
