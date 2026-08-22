const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function inspectHubcloudId() {
    const url = 'https://hubcloud.cx/?id=6cb1d4b4f8b45c83fce843707ca4d0d40446b03f8d17def2c18953759ee28cced939a655605c60c474c335ecf7732fad05325e1976cdf2ee35eba0bb32ef9758002d6dd9a628cf2d08ecca19f196c5a7e3fe5b097bd94280a44368f7386969c8c2340a0ed6be189c34c02a0c3bea4c72::94d30cfe51719403ac145d8ced89153a';
    console.log(`Fetching ${url}...`);

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Referer': 'https://vcloud.fit/'
            },
            httpsAgent: browserHttpsAgent
        });

        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        console.log(`Title: ${$('title').text()}`);

        $('h2 a.btn, div.card-body a.btn, a.btn, a[href]').each((i, el) => {
            console.log(`Link ${i}: [${$(el).text().trim()}] -> ${$(el).attr('href')}`);
        });

    } catch (err) {
        console.error(`Error:`, err.message);
    }
}

inspectHubcloudId();
