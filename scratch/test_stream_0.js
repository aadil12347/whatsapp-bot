const axios = require('axios');

async function test() {
    const url = "https://solopreneurstrategyguide.site/L02HE60pQ/pl/H4sIAAAAAAAAAw3LQXKDIBQA0CsJmjR21zQiY6MOCB9lp6BjFG3qZEz09M3yLV53xD4OGw.dDl7Y2u6NAJuu9Tv_A5tj_clm_memZBHUXevI8ma0IiXZ.LMDZ8huQiaLmULIRtBFnAXFAE.G9U2K88YGd9Clrvjc.7WwW3rRKBfpWpRfe0P7MaVsrRRh7H3bkd.zksdqZKuGLK.x2xsgC3MEqegVWIBfQDaStF.K0pErctTGKGYqvNUT96QCv6HabxXMRrLA4DEwF_4QONnEhZTFRKAdej.n5FtH_SvbzQb0_kwH4BW65xUOn4pyaWO7GvmQEjIuh3OfFqfdKo5gcK4Q2ZXNiZPyEaSzC_Tuhf8p82VZQQEAAA--/master.m3u8";
    
    console.log('Fetching stream_urls[0]...');
    const masterRes = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://nextgencloudfabric.com/'
        }
    });
    console.log('Master M3U8 Content:\n', masterRes.data);

    const lines = masterRes.data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const subUrl = lines[i + 1].trim();
            const fullSubUrl = new URL(subUrl, url).href;
            console.log(`Sub-playlist URL [Line ${i}]: ${fullSubUrl}`);
            const subRes = await axios.get(fullSubUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://nextgencloudfabric.com/'
                }
            });
            const segs = subRes.data.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            console.log(`Sub-playlist segment count: ${segs.length}`);
            
            // Calculate total duration from #EXTINF lines
            const infLines = subRes.data.split('\n').filter(l => l.startsWith('#EXTINF:'));
            let totalDur = 0;
            for (let inf of infLines) {
                const match = inf.match(/#EXTINF:([\d.]+)/);
                if (match) totalDur += parseFloat(match[1]);
            }
            console.log(`Total duration: ${totalDur} seconds (${(totalDur / 60).toFixed(2)} minutes)`);
        }
    }
}

test().catch(console.error);
