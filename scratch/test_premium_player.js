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

async function testPremiumPlayer() {
    const playerId = '30ffbr4ijvhbf4ks';
    const imdbId = 'tt4003440';
    const tmdbId = '398173';

    const testUrls = [
        `https://embedmaster.link/${playerId}/movie/${imdbId}`,
        `https://embedmaster.link/${playerId}/movie/${tmdbId}`
    ];

    for (const embedUrl of testUrls) {
        console.log(`\n==================================================`);
        console.log(`Testing Premium EmbedMaster URL: ${embedUrl}`);
        
        try {
            const res1 = await axios.get(embedUrl, { headers: HEADERS, timeout: 15000 });
            console.log('Page status:', res1.status, 'Length:', res1.data.length);
            const $1 = cheerio.load(res1.data);
            
            let nextgenUrl = $1('#pf').attr('src') || '';
            if (!nextgenUrl) {
                const iframeMatch = res1.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) nextgenUrl = iframeMatch[1];
            }
            console.log('Player Iframe URL:', nextgenUrl);

            if (nextgenUrl) {
                if (nextgenUrl.startsWith('//')) nextgenUrl = `https:${nextgenUrl}`;
                const res2 = await axios.get(nextgenUrl, { headers: { ...HEADERS, 'Referer': embedUrl } });
                const configMatch = res2.data.match(/const CONFIG = ({[\s\S]*?});/);
                
                if (configMatch) {
                    const config = JSON.parse(configMatch[1]);
                    console.log('\nCONFIG parsed:');
                    console.log('isPremium:', config.isPremium);
                    console.log('mediaId:', config.mediaId);
                    console.log('idType:', config.idType);
                    console.log('availableSources:', config.availableSources);
                    console.log('playToken:', config.playToken);

                    let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'tmdb'}=${config.mediaId}&type=${config.mediaType || 'movie'}&token=${config.playToken}&tokenTs=${config.playTokenTs}`;
                    console.log('\nQuerying StreamData API:', apiUrl);

                    const apiRes = await axios.get(apiUrl, { headers: { ...HEADERS, 'Referer': nextgenUrl } });
                    console.log('API Status:', apiRes.data.status_code);
                    console.log('Stream URLs:', apiRes.data.data?.stream_urls);

                    if (apiRes.data.data?.stream_urls?.[0]) {
                        const streamUrl = apiRes.data.data.stream_urls[0];
                        console.log('\nFetching Master M3U8:', streamUrl);
                        const masterRes = await axios.get(streamUrl, { headers: { ...HEADERS, 'Referer': 'https://nextgencloudfabric.com/' } });
                        const lines = masterRes.data.split('\n');

                        let subUrl = '';
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                                subUrl = lines[i + 1].trim();
                                break;
                            }
                        }

                        if (subUrl) {
                            const fullSubUrl = new URL(subUrl, streamUrl).href;
                            console.log('Fetching Sub-playlist M3U8:', fullSubUrl);
                            const subRes = await axios.get(fullSubUrl, { headers: { ...HEADERS, 'Referer': 'https://nextgencloudfabric.com/' } });

                            let totalSec = 0;
                            let segCount = 0;
                            subRes.data.split('\n').forEach(line => {
                                if (line.startsWith('#EXTINF:')) {
                                    const m = line.match(/#EXTINF:([\d.]+)/);
                                    if (m) totalSec += parseFloat(m[1]);
                                }
                                if (line && !line.startsWith('#')) segCount++;
                            });

                            console.log(`\n🎉 Total stream duration: ${(totalSec / 60).toFixed(1)} mins (${(totalSec / 3600).toFixed(2)} hours) | Segments: ${segCount}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error:', e.message);
        }
    }
}

testPremiumPlayer().catch(console.error);
