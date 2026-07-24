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

async function testPremiumPost() {
    const embedUrl = 'https://embedmaster.link/30ffbr4ijvhbf4ks/movie/tt4003440';
    console.log(`1. Fetching welcome page: ${embedUrl}`);
    
    const res1 = await axios.get(embedUrl, { headers: HEADERS });
    const $1 = cheerio.load(res1.data);
    
    const formAction = $1('#welcome-play-form').attr('action');
    const attestValue = $1('input[name="attest"]').val();

    console.log('Form Action:', formAction);
    console.log('Attest token:', attestValue?.substring(0, 50) + '...');

    if (formAction && attestValue) {
        const targetUrl = new URL(formAction, embedUrl).href;
        console.log(`\n2. POSTing to player endpoint: ${targetUrl}`);

        const params = new URLSearchParams();
        params.append('attest', attestValue);
        params.append('orig_referer', '');

        const res2 = await axios.post(targetUrl, params.toString(), {
            headers: {
                ...HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': embedUrl,
                'Origin': 'https://embedmaster.link'
            }
        });

        console.log('POST Response status:', res2.status, 'Length:', res2.data.length);
        const $2 = cheerio.load(res2.data);
        
        let iframeSrc = $2('#pf').attr('src') || $2('iframe').attr('src');
        console.log('Player Iframe Src:', iframeSrc);

        if (iframeSrc) {
            if (iframeSrc.startsWith('//')) iframeSrc = `https:${iframeSrc}`;
            console.log(`\n3. Querying player iframe: ${iframeSrc}`);

            const res3 = await axios.get(iframeSrc, { headers: { ...HEADERS, 'Referer': targetUrl } });
            const configMatch = res3.data.match(/const CONFIG = ({[\s\S]*?});/);

            if (configMatch) {
                const config = JSON.parse(configMatch[1]);
                console.log('\n--- Player CONFIG Parsed ---');
                console.log('isPremium:', config.isPremium);
                console.log('mediaId:', config.mediaId);
                console.log('idType:', config.idType);
                console.log('playToken:', config.playToken);

                let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'imdb'}=${config.mediaId}&type=${config.mediaType || 'movie'}&token=${config.playToken}&tokenTs=${config.playTokenTs}`;
                console.log('\n4. Querying StreamData API:', apiUrl);

                const apiRes = await axios.get(apiUrl, { headers: { ...HEADERS, 'Referer': iframeSrc } });
                console.log('API Status:', apiRes.data.status_code);
                console.log('Stream URLs count:', apiRes.data.data?.stream_urls?.length);

                if (apiRes.data.data?.stream_urls?.[0]) {
                    const masterUrl = apiRes.data.data.stream_urls[0];
                    console.log('\n5. Checking Master M3U8 duration:', masterUrl);

                    const masterRes = await axios.get(masterUrl, { headers: { ...HEADERS, 'Referer': 'https://nextgencloudfabric.com/' } });
                    const lines = masterRes.data.split('\n');

                    let subUrl = '';
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                            subUrl = lines[i + 1].trim();
                            break;
                        }
                    }

                    if (subUrl) {
                        const fullSubUrl = new URL(subUrl, masterUrl).href;
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

                        console.log(`\n🎉🎉🎉 SUCCESS! Total stream duration: ${(totalSec / 60).toFixed(1)} mins (${(totalSec / 3600).toFixed(2)} hours) | Segments: ${segCount}`);
                    }
                }
            }
        }
    }
}

testPremiumPost().catch(console.error);
