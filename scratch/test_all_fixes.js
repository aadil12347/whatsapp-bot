const scraper = require('../src/Utils/movie_scraper');

async function testVcloudSubOptions() {
    const url = 'https://vcloud.zip/uqyqu5ul4l5ddry';
    console.log(`\n[Test 1] Testing sub-options extraction for: ${url}`);
    const options = await scraper.extractSubOptions(url);
    if (options && options.length > 0) {
        console.log(`  Successfully extracted ${options.length} server options:`);
        options.forEach((opt, idx) => {
            console.log(`    ${idx + 1}. [${opt.text}] -> ${opt.href}`);
        });
        if (options.some(opt => opt.text.includes('FSL Server') || opt.text.includes('FSLv2 Server') || opt.text.includes('GDrive'))) {
            console.log('  PASS: FSL/GDrive options found!');
        } else {
            console.log('  FAIL: FSL/GDrive options not found!');
        }
    } else {
        console.log('  FAIL: No options extracted!');
    }
}

async function testDirectVcloudResolution() {
    const url = 'https://vcloud.zip/uqyqu5ul4l5ddry';
    console.log(`\n[Test 2] Testing direct vcloud resolution for: ${url}`);
    const directUrl = await scraper.resolveVcloudLink(url);
    console.log('  Resolved direct URL:', directUrl);
    if (directUrl && directUrl.startsWith('http') && directUrl !== url) {
        console.log('  PASS: Direct URL resolved correctly!');
    } else {
        console.log('  FAIL: Failed to resolve direct URL!');
    }
}

async function runAll() {
    console.log('--- STARTING ALL FIXES VERIFICATION TESTS ---');
    try {
        await testVcloudSubOptions();
        await testDirectVcloudResolution();
        console.log('\n--- ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ---');
    } catch(e) {
        console.error('\nVerification failed:', e.message);
        process.exit(1);
    }
}

runAll();
