const scraper = require('../src/Utils/movie_scraper');

async function run() {
    const url = 'https://vcloud.zip/uqyqu5ul4l5ddry';
    console.log(`[Test] Extracting options from: ${url}`);
    try {
        const options = await scraper.extractSubOptions(url);
        console.log('[Test] Options successfully extracted:');
        options.forEach((opt, idx) => {
            console.log(`  Option ${idx + 1}: [${opt.text}] -> ${opt.href}`);
        });
    } catch(e) {
        console.error('[Test] Extraction failed:', e.message);
    }
}

run();
