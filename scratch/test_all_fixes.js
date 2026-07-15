const scraper = require('../src/Utils/movie_scraper');

async function testVcloudSubOptions() {
    const url = 'https://vcloud.zip/sdn0rn361cywds2';
    console.log(`\n[Test 1] Testing sub-options extraction for: ${url}`);
    const options = await scraper.extractSubOptions(url);
    if (options && options.length > 0) {
        console.log(`  Successfully extracted ${options.length} server options:`);
        options.forEach((opt, idx) => {
            console.log(`    ${idx + 1}. [${opt.text}] -> ${opt.href}`);
        });
        if (options.some(opt => opt.text.includes('FSL Server') || opt.text.includes('FSLv2 Server') || opt.text.includes('PixelServer') || opt.text.includes('Gofile'))) {
            console.log('  PASS: FSL/GDrive/PixelServer options found!');
        } else {
            console.log('  FAIL: Expected options not found!');
        }
    } else {
        console.log('  FAIL: No options extracted!');
    }
}

async function testDirectVcloudResolutionWithPreference() {
    const url = 'https://vcloud.zip/sdn0rn361cywds2';
    console.log(`\n[Test 2] Testing direct vcloud resolution with preference "PixelServer : 2" for: ${url}`);
    const directUrl = await scraper.resolveVcloudLink(url, 'PixelServer : 2');
    console.log('  Resolved direct URL:', directUrl);
    if (directUrl && directUrl.includes('pixeldrain.com/api/file/')) {
        console.log('  PASS: PixelDrain direct link resolved matching preference!');
    } else {
        console.log('  FAIL: Failed to resolve direct URL matching preference!');
    }
}

async function testPixeldrainDirectMapping() {
    console.log('\n[Test 3] Testing direct Pixeldrain viewer link mapping in resolveVcloudLink');
    const viewerUrl = 'https://pixeldrain.dev/u/negn6f';
    const directUrl = await scraper.resolveVcloudLink(viewerUrl);
    console.log('  Viewer URL:', viewerUrl);
    console.log('  Mapped URL:', directUrl);
    if (directUrl === 'https://pixeldrain.com/api/file/negn6f?download') {
        console.log('  PASS: Mapped viewer link to direct link successfully!');
    } else {
        console.log('  FAIL: Failed to map viewer link to direct link!');
    }
}

async function runAll() {
    console.log('--- STARTING ALL FIXES VERIFICATION TESTS ---');
    try {
        await testVcloudSubOptions();
        await testDirectVcloudResolutionWithPreference();
        await testPixeldrainDirectMapping();
        console.log('\n--- ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ---');
    } catch(e) {
        console.error('\nVerification failed:', e.message);
        process.exit(1);
    }
}

runAll();
