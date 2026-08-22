const axios = require('axios');
const cheerio = require('cheerio');
const { browserHttpsAgent, resolveFinalUrl } = require('../src/Utils/movie_scraper');

async function testHubcloudDirect() {
    const rawUrl = 'https://gpdl2.hubcloud.cx/?id=fa35a97fc580ee0c39af55990b2066e8b904a876879931cea532ba387f0aa6497c4d3ebeba9e9004ec63a8b46e7341055e622a19bb1c0c083d6c3b5f7d9e5071d040b4643c5fc1ccbbf51d0a8229da6e38ffc9c55f991314990fbff91f170e610a3c511c6c4ddbc5bb312b06d4926264::441806082c3ce82b7901d4c33a0cc515';
    const tokenUrl = 'https://vcloud.fit/-12_g27fltaetqu?token=bjc0d1padWd2T3lkemxVWG9IVFJYOWVQZnRPNmNJQ0liMmV0Y0cvN1ZVRT0=';

    const testUrls = [
        rawUrl.replace(/gpdl\d*\.hubcloud\.cx/, 'hubcloud.cx'),
        rawUrl.replace(/gpdl\d*\.hubcloud\.cx/, 'hubcloud.club'),
        rawUrl.replace(/gpdl\d*\.hubcloud\.cx/, 'hubcloud.lat'),
        rawUrl.replace(/gpdl\d*\.hubcloud\.cx/, 'hubcloud.ink'),
        rawUrl
    ];

    for (const url of testUrls) {
        console.log(`\nTesting URL: ${url}`);
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': tokenUrl,
                    'Origin': 'https://vcloud.fit'
                },
                httpsAgent: browserHttpsAgent,
                timeout: 10000
            });

            console.log(`Status: ${res.status}`);
            const $ = cheerio.load(res.data);
            console.log(`Title: ${$('title').text()}`);

            const links = [];
            $('a[href]').each((i, el) => {
                const txt = $(el).text().trim().replace(/\s+/g, ' ');
                const href = $(el).attr('href');
                if (href && !href.includes('admin') && !href.includes('telegram') && !href.includes('support')) {
                    links.push({ txt, href });
                }
            });

            console.log(`Found ${links.length} valid download links:`);
            console.log(JSON.stringify(links, null, 2));

            if (links.length > 0) {
                console.log(`\nTesting redirect chain for link 0: ${links[0].href}`);
                let direct = await resolveFinalUrl(links[0].href);
                if (direct && direct.includes('link=')) {
                    direct = decodeURIComponent(direct.split('link=')[1].split('&')[0]);
                }
                console.log(`🎯 DIRECT VIDEO LINK: ${direct}`);
                break;
            }
        } catch (err) {
            console.error(`Failed on ${url}: ${err.message} (status: ${err.response?.status})`);
        }
    }
}

testHubcloudDirect();
