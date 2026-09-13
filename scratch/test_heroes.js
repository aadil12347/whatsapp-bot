const { scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink, fetchHtmlWithRetry } = require('../src/Utils/movie_scraper');
const cheerio = require('cheerio');

async function test() {
    const targetSeason = 3;
    const targetEpisode = 4;
    const targetRes = '720p';

    const post = {
        title: 'Download Heroes (Season 1 - 4) Dual Audio {Hindi-English} NBC Original Series 480p | 720p | 1080p WEB-DL x264',
        link: 'https://new2.vegamovies.futbol/download-heroes-season-1-4-hindi-english-series-480p-720p-1080p-web-dl/'
    };

    console.log(`Scraping post for Season ${targetSeason}...`);
    const allLinks = await scrapeAllPostLinks(post.link);
    console.log(`Total scraped links: ${allLinks.length}`);

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

    const epLandingButtons = activeLinks.filter(l => !l.isPack && (l.resolution || '').toLowerCase() === targetRes);
    console.log(`epLandingButtons for ${targetRes}:`, epLandingButtons.length);
    epLandingButtons.forEach(b => console.log(' Button:', b.text, '| res:', b.resolution, '| href:', b.href));

    const episodes = [];
    for (const epBtn of epLandingButtons) {
        try {
            console.log('Fetching landing page:', epBtn.href);
            const html = await fetchHtmlWithRetry(epBtn.href);
            const $ = cheerio.load(html);
            const vcloudHrefs = [];
            $('a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && !vcloudHrefs.includes(href)) vcloudHrefs.push(href);
            });
            console.log(`Found ${vcloudHrefs.length} VCloud links on landing page`);
            vcloudHrefs.forEach((href, idx) => {
                episodes.push({ epNum: idx + 1, label: `Episode ${idx + 1}`, href });
            });
            if (episodes.length > 0) break;
        } catch (e) {
            console.warn('Landing fetch error:', e.message);
        }
    }

    const matchedEp = episodes.find(e => e.epNum === targetEpisode) || episodes[targetEpisode - 1];
    if (matchedEp) {
        console.log(`\nMatched Episode ${targetEpisode}:`, matchedEp.label, '->', matchedEp.href);
        const isDirectHost = matchedEp.href.includes('vcloud') || matchedEp.href.includes('hubcloud') || matchedEp.href.includes('fastdl') || matchedEp.href.includes('filebee');
        const landing = isDirectHost ? matchedEp.href : await resolveLandingLink(matchedEp.href);
        console.log('Landing / VCloud link:', landing);
        const mediaUrl = await resolveVcloudLink(landing);
        console.log('Final Direct Media URL for Download:', mediaUrl);
    } else {
        console.log(`Episode ${targetEpisode} not found in catalog.`);
    }
}

test();
