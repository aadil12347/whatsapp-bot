const { scrapeAllPostLinks, fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function test() {
    const targetSeason = 5;
    const isExplicitRes = false;
    const targetRes = '720p';

    const post = {
        title: 'Download Peaky Blinders (Season 1-6) Dual Audio [Hindi-English] Complete Web Series 480p | 720p | 1080p BluRay',
        link: 'https://new2.vegamovies.futbol/download-peaky-blinders-season-1-6-hindi-org-480p-720p-1080p-bluray/'
    };

    console.log(`Building catalog for Season ${targetSeason}...`);

    const allLinks = await scrapeAllPostLinks(post.link);

    const seasonLinks = allLinks.filter(l => {
        const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
        const sMatch = text.match(/season\s*(\d+)|\bs(\d+)\b/i);
        if (sMatch) {
            return parseInt(sMatch[1] || sMatch[2], 10) === targetSeason;
        }
        return false;
    });

    const activeLinks = seasonLinks.length > 0 ? seasonLinks : allLinks;
    console.log(`activeLinks for Season ${targetSeason}:`, activeLinks.length);

    const seenRes = new Set();
    const batchZips = [];
    activeLinks.forEach(bl => {
        const isExplicitBatch = bl.isPack || /\bbatch\b|\bzip\b|\bpack\b/i.test(bl.text);
        if (isExplicitBatch && bl.href) {
            const resStr = (bl.resolution || '720p').toLowerCase();
            if (!seenRes.has(resStr)) {
                seenRes.add(resStr);
                batchZips.push({
                    title: `All Episodes (${resStr.toUpperCase()})`,
                    href: bl.href,
                    resolution: resStr
                });
            }
        }
    });

    console.log('Batch zips:', batchZips);

    const resPriority = ['720p', '480p', '1080p', '2160p'];
    const episodes = [];
    let chosenQuality = null;

    for (const res of resPriority) {
        const epLandingButtons = activeLinks.filter(l => !l.isPack && (l.resolution || '').toLowerCase() === res);
        console.log(`Checking epLandingButtons for ${res}:`, epLandingButtons.length);
        for (const epBtn of epLandingButtons) {
            console.log(`Trying ${res} button: ${epBtn.text} (${epBtn.href})`);
            try {
                const html = await fetchHtmlWithRetry(epBtn.href);
                const $ = cheerio.load(html);
                const vcloudHrefs = [];
                $('a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href && !vcloudHrefs.includes(href)) vcloudHrefs.push(href);
                });
                console.log(`Found ${vcloudHrefs.length} vcloud links on ${epBtn.href}`);
                if (vcloudHrefs.length > 0) {
                    chosenQuality = res;
                    vcloudHrefs.forEach((href, idx) => {
                        episodes.push({ epNum: idx + 1, label: `Episode ${idx + 1}`, href });
                    });
                    break;
                }
            } catch (e) {
                console.warn('Error fetching landing page:', e.message);
            }
        }
        if (episodes.length > 0) break;
    }

    console.log(`Extracted ${episodes.length} episodes for resolution ${chosenQuality}:`);
    episodes.forEach(e => console.log(`  ${e.label} -> ${e.href}`));
}

test();
