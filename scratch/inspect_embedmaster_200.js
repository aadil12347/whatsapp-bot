const axios = require('axios');
const cheerio = require('cheerio');

async function inspectEmbedmaster() {
    const url = 'https://embedmaster.link/movie/398173';
    
    const res = await axios.get(url, {
        headers: {
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
        },
        timeout: 15000
    });

    console.log('HTML Length:', res.data.length);
    const $ = cheerio.load(res.data);

    // Look for all script tags, elements with data-src, iframe tags, etc.
    console.log('\n--- All iframe tags ---');
    $('iframe').each((i, el) => {
        console.log(i, $(el).attr('src'), $(el).attr('id'), $(el).attr('class'), $(el).attr('data-src'));
    });

    console.log('\n--- Elements with data-src or id=pf ---');
    $('[data-src], #pf, .player-frame, .player').each((i, el) => {
        console.log(i, el.tagName, $(el).attr('id'), $(el).attr('src'), $(el).attr('data-src'));
    });

    console.log('\n--- Scripts containing player or stream or config ---');
    $('script').each((i, el) => {
        const content = $(el).html() || '';
        const src = $(el).attr('src') || '';
        if (src) console.log('Script src:', src);
        if (content.includes('CONFIG') || content.includes('player') || content.includes('iframe') || content.includes('stream') || content.includes('nextgen') || content.includes('api')) {
            console.log(`Script ${i} snippet:\n`, content.substring(0, 500));
        }
    });
}

inspectEmbedmaster().catch(console.error);
