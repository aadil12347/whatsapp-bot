async function testPackages() {
    console.log('Testing @xaviabot/fb-downloader...');
    try {
        const fbDl = require('@xaviabot/fb-downloader');
        const res = await fbDl('https://www.facebook.com/reel/968134705052923');
        console.log('fb-downloader result:', res);
    } catch (err) {
        console.log('fb-downloader failed:', err.message);
    }

    console.log('\nTesting ruhend-scraper (fbdown / twitter)...');
    try {
        const { fbdown, twitter } = require('ruhend-scraper');
        if (twitter) {
            const twRes = await twitter('https://x.com/SpaceX/status/1834927236531589332');
            console.log('ruhend twitter result:', twRes);
        }
    } catch (err) {
        console.log('ruhend-scraper failed:', err.message);
    }
}

testPackages();
