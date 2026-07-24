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

async function inspectPremiumPage() {
    console.log('Fetching https://embedmaster.link/30ffbr4ijvhbf4ks/movie/tt4003440...');
    const res = await axios.get('https://embedmaster.link/30ffbr4ijvhbf4ks/movie/tt4003440', { headers: HEADERS });
    const $ = cheerio.load(res.data);

    console.log('\n--- All forms and actions ---');
    $('form').each((i, el) => {
        console.log('Form:', $(el).attr('action'), '| method:', $(el).attr('method'), '| id:', $(el).attr('id'));
        $(el).find('input').each((j, inp) => {
            console.log('  Input:', $(inp).attr('name'), '=', $(inp).attr('value'));
        });
    });

    console.log('\n--- All iframes ---');
    $('iframe').each((i, el) => {
        console.log('Iframe src:', $(el).attr('src'), '| id:', $(el).attr('id'));
    });

    console.log('\n--- Searching for player URL in HTML scripts / inline ---');
    $('script').each((i, el) => {
        const text = $(el).html() || '';
        if (text.includes('nextgen') || text.includes('player') || text.includes('embed') || text.includes('src') || text.includes('action')) {
            if (text.length < 500) {
                console.log(`Script ${i}:`, text);
            }
        }
    });
}

inspectPremiumPage().catch(console.error);
