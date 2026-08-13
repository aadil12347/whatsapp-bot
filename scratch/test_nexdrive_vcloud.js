const { extractSubOptions, resolveVcloudLink, resolveFinalUrl } = require('../src/Utils/movie_scraper');

async function testNexdriveVcloudFlow() {
    const nexdriveUrl = 'https://nexdrive.fit/genxfm784776499633/';
    console.log('🧪 Testing Nexdrive -> VCloud -> Direct CDN Extraction Flow...\n');
    console.log(`📌 Nexdrive Landing Page: ${nexdriveUrl}\n`);

    console.log('1️⃣ Extracting VCloud sub-options via extractSubOptions...');
    try {
        const subOpts = await extractSubOptions(nexdriveUrl);
        console.log(`✅ Extracted ${subOpts.length} sub-option(s):`);
        subOpts.forEach((s, i) => console.log(`   [${i + 1}] ${s.text} -> ${s.href.substring(0, 100)}...`));

        if (subOpts.length > 0) {
            console.log('\n2️⃣ Resolving 10Gbps/FSL direct URL for top option:', subOpts[0].text);
            const cand = subOpts[0];
            if (cand.text.toLowerCase().includes('10gbps') || cand.text.toLowerCase().includes('10 gbps')) {
                let resolved = await resolveFinalUrl(cand.href);
                console.log('🚀 10Gbps Direct Video Link Resolved:');
                console.log(`   ${resolved}\n`);
            } else {
                console.log('🚀 Direct Video Link:');
                console.log(`   ${cand.href}\n`);
            }
        }
    } catch (e) {
        console.error('❌ Flow test failed:', e.message);
    }
}

testNexdriveVcloudFlow();
