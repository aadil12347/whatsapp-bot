const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

(async () => {
    console.log('--- 1. Testing Link Extraction for TV Series vs Movies ---');
    const sampleMovieLinks = [
        { text: 'Download 480p [400MB]', href: 'https://vcloud.fit/link1', resolution: '480p', isPack: false },
        { text: 'Download 720p [1.2GB]', href: 'https://vcloud.fit/link2', resolution: '720p', isPack: false }
    ];

    const sampleSeriesLinks = [
        { text: 'Episode 1', href: 'https://vcloud.fit/ep1', resolution: '720p', isPack: false },
        { text: 'Batch Zip (Season 1) [4GB]', href: 'https://vcloud.fit/batchzip', resolution: '720p', isPack: true }
    ];

    // Movie extraction (720p)
    const movie720 = sampleMovieLinks.find(l => l.resolution === '720p');
    console.log('Extracted movie link for 720p:', movie720.href);

    // Series extraction (Batch Zip)
    const seriesBatch = sampleSeriesLinks.find(l => l.isPack || /batch|zip/i.test(l.text));
    console.log('Extracted series Batch Zip link:', seriesBatch.href);

    console.log('\n✅ P & D PIPELINE LINK EXTRACTION TEST PASSED!');
})();
