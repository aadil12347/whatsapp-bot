const { extractSubOptions, resolveFinalUrl } = require('../src/Utils/movie_scraper');

async function testThorFull() {
    const nexdriveUrl = 'https://nexdrive.fit/genxfm78477617107/';
    console.log('🧪 Testing Thor (2011) 480p Nexdrive -> VCloud -> 10Gbps Flow...\n');
    console.log(`📌 Landing URL: ${nexdriveUrl}\n`);

    console.log('1️⃣ Calling extractSubOptions(nexdriveUrl)...');
    try {
        const subOpts = await extractSubOptions(nexdriveUrl);
        console.log(`✅ Extracted ${subOpts.length} valid sub-option(s) (Telegram & FastDL filtered out):`);
        subOpts.forEach((s, i) => console.log(`   [${i + 1}] ${s.text} -> ${s.href}`));

        if (subOpts.length > 0) {
            const topOpt = subOpts[0];
            console.log('\n2️⃣ Resolving 10Gbps final stream URL for:', topOpt.text);
            let directUrl = topOpt.href;
            if (topOpt.text.toLowerCase().includes('10gbps') || topOpt.text.toLowerCase().includes('10 gbps')) {
                directUrl = await resolveFinalUrl(topOpt.href);
            }

            console.log('\n🎯 FINAL DIRECT VIDEO URL:');
            console.log(directUrl);

            if (directUrl.includes('googleusercontent.com')) {
                console.log('\n🎉 SUCCESS! Resolved to direct googleusercontent.com CDN stream link for Thor (2011)!');
            } else {
                console.log('\n⚠️ Resolved to:', directUrl);
            }
        } else {
            console.error('❌ No sub-options found!');
        }
    } catch (e) {
        console.error('❌ Error:', e.message);
    }
}

testThorFull();
