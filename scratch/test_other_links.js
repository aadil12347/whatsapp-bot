const axios = require('axios');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

async function testFastdl() {
    const url = 'https://fastdl.zip/embed.php?download=rwHA1ZvEadUT1GrLNIYnt6MmF';
    console.log('Fetching Fastdl HTML...');
    try {
        const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        console.log('HTML:\n', res.data);
    } catch (e) {
        console.error('Fastdl error:', e.message);
    }
}

testFastdl();
