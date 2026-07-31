const axios = require('axios');
const cheerio = require('cheerio');

async function testHomepage(url) {
    console.log(`\n=== Testing Homepage: ${url} ===`);
    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);
        
        console.log('Page Title:', $('title').text());
        
        // Find article elements
        const articles = $('article, .post-cards, .blog-cards, .recent-post, .post-item, header + div, main .post');
        console.log(`Found ${articles.length} article/card containers`);
        
        const items = [];
        const menuWords = ['home', 'bollywood', 'hollywood', 'south', 'web series', 'genre', 'genres', 'dmca', 'disclaimer', 'contact us', 'about us', 'how to download', 'telegram', 'dual audio', '1080p', '720p', '480p', '2160p', '4k'];
        
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim().replace(/\s+/g, ' ');
            const img = $(el).find('img').first();
            const imgSrc = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('srcset') || img.attr('src') || '';
            
            if (!href || href === '/' || href.includes('/category/') || href.includes('/genre/') || href.includes('/tag/') || href.includes('/page/') || href.includes('imdb.com') || href.includes('telegram')) return;
            
            const lowerText = text.toLowerCase();
            if (menuWords.includes(lowerText)) return;
            
            // Check if title looks like a movie title (usually has length > 10 or includes a year/resolution/quality)
            if (imgSrc && text.length > 5) {
                items.push({ text: text.substring(0, 60), href, imgSrc: imgSrc.substring(0, 60) });
            }
        });
        
        console.log(`Parsed ${items.length} valid movie items:`);
        items.slice(0, 5).forEach((item, i) => {
            console.log(`  [${i+1}] Title: "${item.text}"`);
            console.log(`      Img: ${item.imgSrc}`);
            console.log(`      Url: ${item.href}`);
        });
    } catch (e) {
        console.error(`Failed ${url}:`, e.message);
    }
}

async function run() {
    await testHomepage('https://vegamovies.navy');
    await testHomepage('https://rogmovies.rest');
    await testHomepage('https://new3.hdhub4u.cl');
}
run();
