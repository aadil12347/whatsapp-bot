const { extractSubOptions, resolveVcloudLink, extractDirectDownloadLinks } = require('./src/Utils/movie_scraper');

async function testVcloudExtraction() {
    console.log('🧪 Testing V-Cloud & Download Link Extraction...\n');

    const landingUrl = 'https://nexdrive.fit/genxfm784776497172/';
    const vcloudUrl = 'https://vcloud.zip/mrg9sjg5ec1nuze';

    console.log('1️⃣ Extracting all host links from landing page:', landingUrl);
    try {
        const hosts = await extractDirectDownloadLinks(landingUrl);
        console.log(`✅ Found ${hosts.length} host link(s):`);
        hosts.forEach((h, i) => console.log(`   [${i + 1}] ${h.text} -> ${h.href}`));
    } catch (e) {
        console.error('❌ Failed to extract hosts:', e.message);
    }

    console.log('\n2️⃣ Extracting sub-options from V-Cloud link:', vcloudUrl);
    try {
        const subOpts = await extractSubOptions(vcloudUrl, landingUrl);
        console.log(`✅ Extracted ${subOpts.length} sub-option(s):`);
        subOpts.forEach((s, i) => console.log(`   [${i + 1}] ${s.text} -> ${s.href.substring(0, 100)}...`));
    } catch (e) {
        console.error('❌ Failed to extract sub-options:', e.message);
    }

    console.log('\n3️⃣ Resolving direct video download URL for V-Cloud:');
    try {
        const directUrl = await resolveVcloudLink(vcloudUrl, null, landingUrl);
        console.log('🚀 Direct Download URL Resolved Successfully:');
        console.log(`   ${directUrl}\n`);
    } catch (e) {
        console.error('❌ Failed to resolve direct V-Cloud URL:', e.message);
    }
}

testVcloudExtraction();
