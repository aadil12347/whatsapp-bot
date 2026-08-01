const { resolveSingleVcloudEpisode } = require('../src/Utils/movie_scraper');

async function testZzbdpWithScraper() {
    console.log('Testing resolveSingleVcloudEpisode for https://vcloud.zip/zzbdp-vpznrfnnn ...');
    const result = await resolveSingleVcloudEpisode('https://vcloud.zip/zzbdp-vpznrfnnn', 'https://nexdrive.fit/', 20000);
    console.log('\nResult returned from resolveSingleVcloudEpisode:');
    console.log(result);
}

testZzbdpWithScraper();
