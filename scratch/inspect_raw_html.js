const axios = require('axios');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function getRawHtml(url) {
    console.log(`=== RAW HTML FOR ${url} ===`);
    try {
        const res = await axios.get(url, { headers: HEADERS });
        console.log(`Status: ${res.status}`);
        console.log(`Headers:`, res.headers);
        console.log(`HTML snippet (first 1500 chars):\n${res.data.substring(0, 1500)}`);
    } catch(e) {
        console.error('Error:', e.message);
    }
}

async function main() {
    await getRawHtml('https://hubcdn.sbs/file/kamfA957oSYKhAH4gSnJOF78L');
    await getRawHtml('https://hubcloud.foo/drive/search-recover.php?from_ac=PNdnP0r8IhLA3xeJ9ta0UhkU4__GYN_h-iyUKC73USWZwIxH&q=VHJpZ2dlciBTMDEgRXBpc29kZSAxIDcyMHA');
}

main();
