const axios = require('axios');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
};

async function testHubcloudApi() {
    const url = 'https://hubcloud.foo/drive/search-recover.php?api=search&q=Trigger+S01+Episode+5+720p&page=1&from_ac=dcFetFuQrBCF7LHa20BoGRqsDRTSPIruH8G_QvshsAFQsDzU';
    console.log(`Fetching HubCloud Search API: ${url}...`);
    try {
        const res = await axios.get(url, { headers: HEADERS });
        console.log("JSON response:\n", JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error("API error:", e.message);
    }
}

testHubcloudApi();
