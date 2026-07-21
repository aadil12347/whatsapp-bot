const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
};

async function inspectHubcloudSearch(url) {
    console.log(`Fetching ${url}...`);
    const res = await axios.get(url, { headers: HEADERS });
    const $ = cheerio.load(res.data);
    
    console.log("Full HTML body:\n", $.html());
}

inspectHubcloudSearch('https://hubcloud.foo/drive/search-recover.php?from_ac=dcFetFuQrBCF7LHa20BoGRqsDRTSPIruH8G_QvshsAFQsDzU&q=VHJpZ2dlciBTMDEgRXBpc29kZSA1IDcyMHA');
