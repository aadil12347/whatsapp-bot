const axios = require('axios');
const cheerio = require('cheerio');
const { fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');

async function test() {
    const domain = 'https://new2.vegamovies.futbol/';
    const query = 'Peaky Blinders';

    console.log('1. Trying search.php API...');
    try {
        const res = await axios.get(`${domain}search.php?q=${encodeURIComponent(query)}&page=1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Referer': domain
            },
            timeout: 10000
        });
        console.log('search.php status:', res.status, 'hits:', res.data?.hits?.length);
    } catch (e) {
        console.log('search.php failed:', e.message);
    }

    console.log('\n2. Trying search.html page...');
    try {
        const htmlUrl = `${domain}search.html?q=${encodeURIComponent(query)}&page=1`;
        console.log('Fetching search.html:', htmlUrl);
        const html = await fetchHtmlWithRetry(htmlUrl);
        const $ = cheerio.load(html);
        console.log('Title:', $('title').text());
        const posts = [];
        $('article, .post-item, h2.entry-title, .entry-title, div.post-cards article').each((_, el) => {
            const a = $(el).is('a') ? $(el) : $(el).find('a[href]').first();
            if (a.length) {
                const href = a.attr('href');
                const title = a.text().trim() || $(el).text().trim();
                if (href && title && !href.includes('/category/') && !href.includes('/tag/') && !posts.some(p => p.link === href)) {
                    posts.push({ title, link: href });
                }
            }
        });
        console.log(`Found ${posts.length} posts on search.html page:`);
        posts.forEach((p, i) => console.log(`[${i}] ${p.title} -> ${p.link}`));
    } catch (e) {
        console.log('search.html failed:', e.message);
    }

    console.log('\n3. Trying /?s= search...');
    try {
        const htmlUrl = `${domain}?s=${encodeURIComponent(query)}`;
        console.log('Fetching /?s=:', htmlUrl);
        const html = await fetchHtmlWithRetry(htmlUrl);
        const $ = cheerio.load(html);
        console.log('Title:', $('title').text());
        const posts = [];
        $('article, .post-item, h2.entry-title, .entry-title').each((_, el) => {
            const a = $(el).is('a') ? $(el) : $(el).find('a[href]').first();
            if (a.length) {
                const href = a.attr('href');
                const title = a.text().trim() || $(el).text().trim();
                if (href && title && !href.includes('/category/') && !href.includes('/tag/') && !posts.some(p => p.link === href)) {
                    posts.push({ title, link: href });
                }
            }
        });
        console.log(`Found ${posts.length} posts on /?s= page:`);
        posts.forEach((p, i) => console.log(`[${i}] ${p.title} -> ${p.link}`));
    } catch (e) {
        console.log('/?s= failed:', e.message);
    }
}

test();
