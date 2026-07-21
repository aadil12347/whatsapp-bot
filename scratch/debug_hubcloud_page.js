const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function testDriveUrl(url) {
    console.log(`\nFetching ${url}...`);
    try {
        const res = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(res.data);
        console.log(`Page Title: "${$('title').text().trim()}"`);
        
        const anchors = [];
        $('a[href]').each((_, el) => {
            anchors.push({ text: $(el).text().trim(), href: $(el).attr('href') });
        });
        console.log(`Found ${anchors.length} anchors:`);
        anchors.forEach(a => console.log(`  - "${a.text}" -> ${a.href}`));
    } catch(e) {
        console.error('Fetch error:', e.message);
    }
}

async function main() {
    // HubCloud Drive search-recover URL:
    await testDriveUrl('https://hubcloud.foo/drive/search-recover.php?from_ac=PNdnP0r8IhLA3xeJ9ta0UhkU4__GYN_h-iyUKC73USWZwIxH&q=VHJpZ2dlciBTMDEgRXBpc29kZSAxIDcyMHA');
    
    // HubCDN file URL:
    await testDriveUrl('https://hubcdn.sbs/file/kamfA957oSYKhAH4gSnJOF78L');
}

main();
