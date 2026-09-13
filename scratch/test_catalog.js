const { scrapeAllPostLinks } = require('../src/Utils/movie_scraper');

async function test() {
    const targetSeason = 1;
    const isExplicitRes = false;
    const targetRes = '720p';

    const candidates = [
        { title: 'Download Stranger Things (Season 1) Dual Audio [Hindi-English] Complete Netflix Web Series 480p [200MB] | 720p [450MB] | 1080p [1GB]', link: 'https://new2.vegamovies.futbol/download-stranger-things-season-1-dual-audio-hindi-org-audio/' },
        { title: 'Download Stranger Things: Tales from 85 (2026) Season 1 Dual Audio', link: 'https://new2.vegamovies.futbol/download-stranger-things-tales-from-85-2026-season-1/' }
    ];

    const post = candidates[0];

    const targetPosts = [];
    const individualPost = candidates.find(c => {
        const t = (c.title || '').toLowerCase();
        const isIndividual = !/season[s]?\s*\d+\s*[-–]\s*\d+|\ball\s*season[s]?\b|\bcomplete\b/i.test(t);
        const seasonMatch = t.match(/season\s*(\d+)|\bs(\d+)\b/i);
        return isIndividual && seasonMatch && parseInt(seasonMatch[1] || seasonMatch[2], 10) === targetSeason;
    });
    if (individualPost) targetPosts.push(individualPost);

    const combinedPost = candidates.find(c => {
        const t = (c.title || '').toLowerCase();
        const rangeMatch = t.match(/season[s]?\s*(\d+)\s*[-–]\s*(\d+)/i);
        if (rangeMatch) {
            const startS = parseInt(rangeMatch[1], 10);
            const endS = parseInt(rangeMatch[2], 10);
            return targetSeason >= startS && targetSeason <= endS;
        }
        return /all\s*season[s]?|complete\s*series|seasons/i.test(t);
    });
    if (combinedPost && !targetPosts.some(p => p.link === combinedPost.link)) {
        targetPosts.push(combinedPost);
    }
    if (!targetPosts.some(p => p.link === post.link)) {
        targetPosts.push(post);
    }

    console.log('Target posts count:', targetPosts.length);
    targetPosts.forEach(p => console.log('Target post:', p.title, p.link));

    let allLinks = [];
    for (const p of targetPosts) {
        try {
            const links = await scrapeAllPostLinks(p.link);
            links.forEach(l => { l._postTitle = p.title; l._postLink = p.link; });
            allLinks.push(...links);
        } catch (e) {
            console.warn(`Error scraping post links for ${p.title}:`, e.message);
        }
    }

    console.log('Total scraped allLinks:', allLinks.length);

    const seasonLinks = allLinks.filter(l => {
        const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
        const sMatch = text.match(/season\s*(\d+)|\bs(\d+)\b/i);
        if (sMatch) {
            return parseInt(sMatch[1] || sMatch[2], 10) === targetSeason;
        }
        return true;
    });

    const activeLinks = seasonLinks.length > 0 ? seasonLinks : allLinks;
    console.log('activeLinks count:', activeLinks.length);

    const resPriority = isExplicitRes ? [targetRes] : ['720p', '480p', '1080p', '2160p'];
    for (const res of resPriority) {
        const epLandingButtons = activeLinks.filter(l => !l.isPack && (l.resolution || '').toLowerCase() === res);
        console.log(`epLandingButtons for ${res}:`, epLandingButtons.length);
        epLandingButtons.forEach(b => console.log('  Button:', b.text, '| res:', b.resolution, '| href:', b.href, '| post:', b._postTitle));
    }
}

test();
