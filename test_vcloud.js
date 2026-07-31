const { extractSubOptions, resolveVcloudLink, extractDirectDownloadLinks } = require('./src/Utils/movie_scraper');

async function testVcloudExtraction() {
    const customUrl = process.argv[2];
    const customProxy = process.argv[3];

    if (customProxy) {
        process.env.PROXY_URL = customProxy;
        console.log(`🌐 Using Proxy: ${customProxy}`);
    }

    const defaultLandingUrl = 'https://nexdrive.fit/genxfm784776497172/';
    const defaultVcloudUrl = 'https://vcloud.zip/mrg9sjg5ec1nuze';

    const testUrl = customUrl || defaultVcloudUrl;
    const landingUrl = customUrl ? null : defaultLandingUrl;

    console.log('🧪 Testing V-Cloud & Download Link Extraction...\n');
    console.log(`📌 Target Link: ${testUrl}\n`);

    if (!customUrl) {
        console.log('1️⃣ Extracting all host links from landing page:', landingUrl);
        try {
            const hosts = await extractDirectDownloadLinks(landingUrl);
            console.log(`✅ Found ${hosts.length} host link(s):`);
            hosts.forEach((h, i) => console.log(`   [${i + 1}] ${h.text} -> ${h.href}`));
        } catch (e) {
            console.error('❌ Failed to extract hosts:', e.message);
        }
        console.log('');
    }

    console.log('2️⃣ Extracting sub-options from link:', testUrl);
    try {
        const subOpts = await extractSubOptions(testUrl, landingUrl);
        console.log(`✅ Extracted ${subOpts.length} sub-option(s):`);
        subOpts.forEach((s, i) => console.log(`   [${i + 1}] ${s.text} -> ${s.href.substring(0, 100)}...`));
    } catch (e) {
        console.error('❌ Failed to extract sub-options:', e.message);
    }

    console.log('\n3️⃣ Resolving direct video download URL:');
    try {
        const directUrl = await resolveVcloudLink(testUrl, null, landingUrl);
        console.log('🚀 Direct Download URL Resolved Successfully:');
        console.log(`   ${directUrl}\n`);
    } catch (e) {
        console.error('❌ Failed to resolve direct V-Cloud URL:', e.message);
    }
}

testVcloudExtraction();
