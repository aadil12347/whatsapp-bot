const axios = require('axios');
const { browserHttpsAgent } = require('../src/Utils/movie_scraper');

async function testHubcloudDomains() {
    const rawUrl = 'https://gpdl2.hubcloud.cx/?id=4b89dfadcfd245a9232c6a380a072a734374e82fd0618120d36d62b7fc70dcf02a5ffd83fd45015549cd2ff2c33548c7df704b0a31f5564d959198f3c5feb5a81b785e97cf37fcdc41ea58a5d3a37e6609ba26b31eb8308064aa37bca3ce32bbb6cbd0750fdc0869343b44a024c6cc3d::efd7fb14537337b541890f82466ba87a';

    const testDomains = [
        'gpdl2.hubcloud.cx',
        'gpdl.hubcloud.cx',
        'hubcloud.cx',
        'hubcloud.club',
        'hubcloud.lat',
        'hubcloud.win',
        'hubcloud.ink',
        'hubcloud.link',
        'hubcloud.fit'
    ];

    const idPart = rawUrl.split('?id=')[1];

    for (const dom of testDomains) {
        const testUrl = `https://${dom}/?id=${idPart}`;
        try {
            console.log(`Testing: ${testUrl}`);
            const res = await axios.get(testUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://vcloud.fit/'
                },
                httpsAgent: browserHttpsAgent,
                timeout: 8000
            });

            console.log(`===> SUCCESS on ${dom}! Status: ${res.status}, Length: ${res.data.length}`);
            console.log(res.data.substring(0, 300));
            break;
        } catch (err) {
            console.log(`Failed on ${dom}: ${err.message} (status: ${err.response?.status})`);
        }
    }
}

testHubcloudDomains();
