const { resolveVcloudLink, extractSubOptions } = require('../src/Utils/movie_scraper');

async function testAllServers() {
    console.log('--- Testing Option 1 Servers ---');
    const servers = [
        { name: 'G-Direct (fastdl)', url: 'https://fastdl.zip/embed.php?download=4Dp6gevvqCjFYQmpY5bur4b6G' },
        { name: 'Filepress (filebee)', url: 'https://filebee.xyz/file/6a881d8987ebcb22d0babd51' },
        { name: 'V-Cloud', url: 'https://vcloud.fit/6sqqegugf14yeef' },
        { name: 'Gofile', url: 'https://gofile.io/d/aGWL0HYV' },
        { name: 'Hubcloud CX', url: 'https://hubcloud.cx/?id=737bc9262f9882c05dfbd39d28df3dae41957697fc80b4021bfdc6ab162be3b59f3b164e0e37ebeba461784a12327e2cd2c738e02e9b00005e09401e2d5e4e133b13a5aa0c8a8029b78a3084e84399f9b497c535af2fd36116776337b13bb0aa213a197da13df8688d7853f6844c4133::302a9d027955accbc4735cf94fe5e320' }
    ];

    for (const s of servers) {
        console.log(`\nTesting ${s.name}: ${s.url}`);
        try {
            const direct = await resolveVcloudLink(s.url);
            console.log(`✅ Result for ${s.name}: ${direct}`);
        } catch (e) {
            console.error(`❌ Failed for ${s.name}: ${e.message}`);
        }
    }
}

testAllServers();
