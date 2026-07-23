const axios = require('axios');
const { searchStreamImdb, getMediaDetails, resolveStreamOptions } = require('../src/Utils/streamimdb_scraper');

async function test() {
    console.log('Fetching fresh stream options for The House That Jack Built...');
    const results = await searchStreamImdb('The House That Jack Built');
    const details = await getMediaDetails(results[0].href);
    const options = await resolveStreamOptions(details.embedUrl);
    
    for (let opt of options) {
        console.log(`\n========================================`);
        console.log(`Testing option: ${opt.quality}`);
        console.log(`Master URL: ${opt.streamUrl}`);
        
        try {
            const masterRes = await axios.get(opt.streamUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': 'https://nextgencloudfabric.com/'
                }
            });
            console.log('Master M3U8 Content:\n', masterRes.data);
            
            // Resolve sub-playlist
            if (masterRes.data.includes('#EXT-X-STREAM-INF')) {
                const lines = masterRes.data.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                        const subUrl = lines[i + 1].trim();
                        const fullSubUrl = new URL(subUrl, opt.streamUrl).href;
                        console.log(`Sub-playlist URL [Line ${i}]: ${fullSubUrl}`);
                        const subRes = await axios.get(fullSubUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                                'Referer': 'https://nextgencloudfabric.com/'
                            }
                        });
                        const segs = subRes.data.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                        console.log(`Sub-playlist segment count: ${segs.length}`);
                    }
                }
            } else {
                const segs = masterRes.data.split('\n').filter(l => l.trim() && !l.startsWith('#'));
                console.log(`Direct playlist segment count: ${segs.length}`);
            }
        } catch (err) {
            console.error(`Error parsing ${opt.quality}:`, err.message);
        }
    }
}

test().catch(console.error);
