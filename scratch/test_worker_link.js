const axios = require('axios');
const cheerio = require('cheerio');

async function testWorker() {
    const url = 'https://gpdl2.rohitkiskk.workers.dev/?id=710ff3aefdb0c2bed919937f9d76efceac363048d64a6f2e78a7a755f1e52a458802d769a41e0915763cb16fb192cbe35e88f8d9d2eb540f2a1dd8b7fd8c5b661fc7678b77970c5af6b506fbdbb57cdf33800efd843b081f8b0405a67c08e05f4ccab0fa8532fd833d5f71f843b94d2e::6823a10dc940a555d90ddb589b77f70d';
    
    const res = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
        }
    });

    console.log('Status:', res.status);
    console.log('Final URL after redirects:', res.request.res.responseUrl || res.config.url);
    
    const $ = cheerio.load(res.data);
    const downloadBtnHref = $('#downloadBtn').attr('href');
    console.log('downloadBtn href:', downloadBtnHref);

    const scripts = $('script').map((i, el) => $(el).html()).get();
    console.log('Scripts containing link:');
    scripts.forEach((s, idx) => {
        if (s && (s.includes('link') || s.includes('location'))) {
            console.log(`--- Script ${idx} ---`);
            console.log(s);
        }
    });
}

testWorker().catch(console.error);
