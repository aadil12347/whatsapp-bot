const axios = require('axios');
const cheerio = require('cheerio');

async function inspectLeninPage() {
    const url = 'https://new2.rogmovies.click/download-lenin-2026-hindi-dd5-1-full-movie-480p-720p-1080p-amzn-web-dl/';
    console.log('Fetching:', url);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000
        });

        const $ = cheerio.load(res.data);
        console.log('Title:', $('title').text().trim());

        const links = [];
        $('a[href]').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            if (href && (href.includes('nexdrive') || href.includes('vcloud') || href.includes('hubcloud') || href.includes('fastdl') || href.includes('download') || href.includes('link'))) {
                links.push({ text, href, parent: $(el).parent().text().trim().substring(0, 100) });
            }
        });

        console.log(`Found ${links.length} relevant links:`);
        links.forEach((l, i) => console.log(`[${i+1}] "${l.text}" -> ${l.href}`));

        // Also print all h3/h4/p with links around them
        console.log('\n--- ALL DOWNLOAD BUTTONS / BLOCKS ---');
        $('p, h3, h4, div.entry-content').find('a[href]').each((i, el) => {
            const h = $(el).attr('href');
            const t = $(el).text().trim();
            console.log(`Link #${i+1}: text="${t}" href="${h}"`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

inspectLeninPage();
