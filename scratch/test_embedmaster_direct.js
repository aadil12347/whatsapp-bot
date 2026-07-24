const axios = require('axios');
const cheerio = require('cheerio');

const CHROME_HEADERS = {
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

async function testEmbedmasterDirect() {
    const embedUrl = 'https://embedmaster.link/movie/398173';
    console.log(`[EmbedMaster Direct Test] Fetching: ${embedUrl}`);
    
    const res1 = await axios.get(embedUrl, { headers: CHROME_HEADERS, timeout: 15000 });
    console.log('Status code:', res1.status);
    
    // Check if nextgen iframe or pf or config is present
    const $1 = cheerio.load(res1.data);
    let nextgenUrl = $1('#pf').attr('src') || '';
    if (!nextgenUrl) {
        const match = res1.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (match) nextgenUrl = match[1];
    }
    console.log('Nextgen URL extracted from EmbedMaster:', nextgenUrl);

    if (!nextgenUrl) {
        // Embedmaster uses streamimdb player embed directly if iframe isn't inline
        const tmdbMatch = embedUrl.match(/\/(movie|tv)\/(\d+)/i);
        if (tmdbMatch) {
            const playerUrl = `https://streamimdb.ru/embed/${tmdbMatch[1]}/${tmdbMatch[2]}`;
            console.log('Fetching EmbedMaster player backend via:', playerUrl);
            const resPlayer = await axios.get(playerUrl, { headers: CHROME_HEADERS, timeout: 15000 });
            const $p = cheerio.load(resPlayer.data);
            nextgenUrl = $p('#pf').attr('src') || '';
            console.log('Nextgen URL from player backend:', nextgenUrl);
        }
    }

    if (nextgenUrl) {
        if (nextgenUrl.startsWith('//')) nextgenUrl = `https:${nextgenUrl}`;
        const res2 = await axios.get(nextgenUrl, {
            headers: {
                ...CHROME_HEADERS,
                'Referer': embedUrl
            },
            timeout: 15000
        });

        const configMatch = res2.data.match(/const CONFIG = ({[\s\S]*?});/);
        if (configMatch) {
            const config = JSON.parse(configMatch[1]);
            let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'tmdb'}=${config.mediaId}&type=${config.mediaType || 'movie'}`;
            apiUrl += `&token=${config.playToken}&tokenTs=${config.playTokenTs}`;
            
            const apiRes = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': CHROME_HEADERS['User-Agent'],
                    'Referer': nextgenUrl,
                    'Origin': new URL(nextgenUrl).origin
                },
                timeout: 15000
            });
            console.log('StreamData API response:', apiRes.data);
        }
    }
}

testEmbedmasterDirect().catch(console.error);
