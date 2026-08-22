const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent, resolveFinalUrl } = require('../src/Utils/movie_scraper');

async function testHubcloudPage() {
    const rawUrl = 'https://gpdl2.hubcloud.cx/?id=fa35a97fc580ee0c39af55990b2066e8b904a876879931cea532ba387f0aa6497c4d3ebeba9e9004ec63a8b46e7341055e622a19bb1c0c083d6c3b5f7d9e5071d040b4643c5fc1ccbbf51d0a8229da6e38ffc9c55f991314990fbff91f170e610a3c511c6c4ddbc5bb312b06d4926264::441806082c3ce82b7901d4c33a0cc515';

    // Replace gpdl2.hubcloud.cx / gpdl.hubcloud.cx with hubcloud.cx
    const fixedUrl = rawUrl.replace(/gpdl\d*\.hubcloud\.cx/, 'hubcloud.cx');
    console.log(`Fetching fixed URL: ${fixedUrl}`);

    try {
        const res = await axios.get(fixedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://vcloud.fit/'
            },
            httpsAgent: browserHttpsAgent,
            timeout: 15000
        });

        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        console.log(`Title: ${$('title').text()}`);

        const dlLinks = [];
        $('h2 a.btn, div.card-body a.btn, a.btn, a[href]').each((i, el) => {
            const txt = $(el).text().trim().replace(/\s+/g, ' ');
            const href = $(el).attr('href');
            if (href && href.startsWith('http')) {
                dlLinks.push({ txt, href });
            }
        });

        console.log(`Found ${dlLinks.length} download servers on hubcloud.cx page:`);
        console.log(JSON.stringify(dlLinks, null, 2));

        if (dlLinks.length > 0) {
            const first = dlLinks[0];
            console.log(`\nResolving 10Gbps redirect chain for ${first.txt} (${first.href})...`);
            let directUrl = await resolveFinalUrl(first.href);
            if (directUrl && directUrl.includes('link=')) {
                directUrl = decodeURIComponent(directUrl.split('link=')[1].split('&')[0]);
            }
            console.log(`🎯 FINAL DIRECT VIDEO URL: ${directUrl}`);
        }

    } catch (err) {
        console.error(`Error:`, err.message);
    }
}

testHubcloudPage();
