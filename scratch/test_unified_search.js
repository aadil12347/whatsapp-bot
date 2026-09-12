const axios = require('axios');
const cheerio = require('cheerio');
const { fetchHtmlWithRetry, searchHdhub4u } = require('../src/Utils/movie_scraper');

async function searchMoviesAndSeries(query) {
    const cleanQuery = query.replace(/1080p|720p|480p|4k|season\s*\d+|episode\s*\d+/gi, '').trim();
    console.log(`🔍 [UnifiedSearch] Searching movies & series for: "${cleanQuery}"`);

    const candidatePosts = [];

    // 1. Search HDHub4u
    try {
        console.log(`[UnifiedSearch] Fetching HDHub4u results...`);
        const hdhubResults = await searchHdhub4u(cleanQuery);
        if (hdhubResults && hdhubResults.length > 0) {
            hdhubResults.slice(0, 5).forEach(r => {
                candidatePosts.push({
                    site: 'HDHub4u',
                    title: r.title || r.postTitle,
                    link: r.link || r.postUrl
                });
            });
        }
    } catch (err) {
        console.warn('[UnifiedSearch] HDHub4u search error:', err.message);
    }

    // 2. Search Vegamovies & Rogmovies via search pages / sitemaps / search query
    const searchUrls = [
        { site: 'Vegamovies', url: `https://vegamovies.mex.com/?s=${encodeURIComponent(cleanQuery)}` },
        { site: 'Vegamovies', url: `https://vegamovies.pages.dev/?s=${encodeURIComponent(cleanQuery)}` },
        { site: 'Rogmovies', url: `https://rogmovies.pages.dev/?s=${encodeURIComponent(cleanQuery)}` }
    ];

    for (const item of searchUrls) {
        try {
            const html = await fetchHtmlWithRetry(item.url);
            const $ = cheerio.load(html);
            $('article, .post-item, h2.entry-title, .entry-title').each((_, el) => {
                const a = $(el).is('a') ? $(el) : $(el).find('a[href]').first();
                if (a.length) {
                    const href = a.attr('href');
                    const title = a.text().trim() || $(el).text().trim();
                    if (href && title && !href.includes('/category/') && !href.includes('/tag/') && !candidatePosts.some(p => p.link === href)) {
                        candidatePosts.push({ site: item.site, title, link: href });
                    }
                }
            });
        } catch (_) {}
    }

    console.log(`✅ [UnifiedSearch] Collected ${candidatePosts.length} total candidate post(s).`);
    return candidatePosts;
}

async function main() {
    const results = await searchMoviesAndSeries("Superman 2025");
    console.log("Final Candidates:", results.slice(0, 5));
}

main();
