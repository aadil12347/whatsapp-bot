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
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1'
};

async function testAttestResolver(embedUrl) {
    console.log(`[EmbedMaster] Resolving: ${embedUrl}`);
    let res1 = await axios.get(embedUrl, { headers: HEADERS, timeout: 15000 });
    let $1 = cheerio.load(res1.data);
    
    let nextgenUrl = $1('#pf').attr('src') || '';
    if (!nextgenUrl) {
        const iframeMatch = res1.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) nextgenUrl = iframeMatch[1];
    }

    if (!nextgenUrl && $1('#welcome-play-form').length > 0) {
        const formAction = $1('#welcome-play-form').attr('action');
        const attestValue = $1('input[name="attest"]').val();
        if (formAction && attestValue) {
            const targetUrl = new URL(formAction, embedUrl).href;
            console.log(`[EmbedMaster] Submitting player access token to: ${targetUrl}`);
            const params = new URLSearchParams();
            params.append('attest', attestValue);
            params.append('orig_referer', '');

            const resPost = await axios.post(targetUrl, params.toString(), {
                headers: {
                    ...HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': embedUrl,
                    'Origin': 'https://embedmaster.link'
                },
                timeout: 15000
            });
            $1 = cheerio.load(resPost.data);
            nextgenUrl = $1('#pf').attr('src') || $1('iframe').attr('src') || '';
        }
    }

    console.log('Resolved Player Iframe URL:', nextgenUrl);
    return nextgenUrl;
}

testAttestResolver('https://embedmaster.link/30ffbr4ijvhbf4ks/movie/tt4003440').catch(console.error);
