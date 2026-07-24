const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

async function inspectSources() {
    console.log('Fetching NextGen Cloud Fabric embed page...');
    const res1 = await axios.get('https://nextgencloudfabric.com/embed/movie/tt4003440', { headers: HEADERS });
    const $1 = cheerio.load(res1.data);
    
    console.log('All buttons/servers in NextGen page:');
    $1('button, a, div, span').each((i, el) => {
        const text = $1(el).text().trim();
        const dataSrc = $1(el).attr('data-src') || $1(el).attr('data-url') || $1(el).attr('data-id');
        if (text || dataSrc) {
            console.log(`[${el.tagName}] text: "${text}" dataSrc: "${dataSrc}" class: "${$1(el).attr('class')}" id: "${$1(el).attr('id')}"`);
        }
    });

    console.log('\nAll script content containing source or server or api:');
    $1('script').each((i, el) => {
        const content = $1(el).html() || '';
        if (content.includes('CONFIG') || content.includes('source') || content.includes('server') || content.includes('api') || content.includes('playToken')) {
            console.log(`--- Script ${i} ---`);
            console.log(content);
        }
    });
}

inspectSources().catch(console.error);
