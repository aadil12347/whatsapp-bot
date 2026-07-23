const axios = require('axios');
const { parseM3u8Segments } = require('../src/Utils/streamimdb_scraper');

async function test() {
    const url = "https://solopreneurstrategyguide.site/L02HE60pQ/pl/H4sIAAAAAAAAAw3O3ZKCIBgA0FcCrCa6W0ssiq_G8AfuUHRMcXVrJ42n3z1PcBBu1iuMmi3aGLrBdWVquqJB02xLsjGN3ZW59nc2YnvsAx檐/master.m3u8";
    const masterUrl = "https://solopreneurstrategyguide.site/L02HE60pQ/pl/H4sIAAAAAAAAAw3O3ZKCIBgA0FcCrCa6W0ssiq_G8AfuUHRMcXVrJ42n3z1PcBBu1iuMmi3aGLrBdWVquqJB02xLsjGN3ZW59nc2YnvsAxHD7yxPribWYT0sXgX8LWN3PnuYlUyYiNvEuhOpWIVK3L7UoOeaubf50EDn2omC_2jGRtHD7RrzKPGwz.KtN549bB7NtpiEGHQmDnAz5LdTKXpm3ReRTD.qPvoo3C9aqkWiLIFCGzHgqIxZD8cQwNvw7jjSXXsWw6SSwr3yPY20hPaCJ5xKeBi0jtNsutfy_99nUBH1EelruZC2E4SeTOGOMh.XhIVzfdAsLSZke4CaMQHR2kvJZ0B8kY4_LRm99Yj.ATTPeYNBAQAA/master.m3u8";
    
    console.log('Fetching master m3u8...');
    const res = await axios.get(masterUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://nextgencloudfabric.com/'
        }
    });
    console.log('Master content:\n', res.data);

    console.log('\n--- Running parseM3u8Segments ---');
    const parsed = await parseM3u8Segments(masterUrl, 'https://nextgencloudfabric.com/');
    console.log('Segment count:', parsed.segmentUrls.length);
    console.log('Media M3U8 URL:', parsed.mediaM3u8Url);
    if (parsed.segmentUrls.length > 0) {
        console.log('First segment:', parsed.segmentUrls[0]);
        console.log('Last segment:', parsed.segmentUrls[parsed.segmentUrls.length - 1]);
    }
}

test().catch(console.error);
