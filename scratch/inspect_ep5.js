const axios = require('axios');
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function checkEp5() {
    const res = await axios.get('https://hubcdn.sbs/file/UVAu5IHVO3Bp9h9oWPgz8m0r4', { headers: HEADERS });
    console.log(res.data);
}
checkEp5();
