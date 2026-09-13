const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink } = require('../Utils/movie_scraper');

// In-memory state tracking
const pendingPreConfirmations = new Map();
const pendingPostSelections = new Map();

/**
 * Helper to resolve media URL for TV Series seasons:
 * - If NO episode is specified (intent.episode is null): Target and download the Season Batch Zip (pack).
 * - If an episode IS specified (intent.episode is set e.g. 5): Target Episode 5 VCloud direct link.
 *   - If VCloud direct link is not explicitly on the button, check other single episode links for Episode 5 (which resolve landing pages to VCloud).
 *   - If Episode 5 single link is unavailable, check if Season Batch Zip is available.
 *   - If Batch Zip is available, return fallback state to ask user via Yes/No confirmation prompt.
 */
async function getSeriesSeasonMediaUrl(post, intent, candidates = []) {
    const targetSeason = intent.season || 1;
    const targetEpisode = intent.episode || null;
    const targetRes = (intent.resolution || '720p').toLowerCase();

    console.log(`[AISearch] Resolving TV Series media URL for Season ${targetSeason}${targetEpisode ? `, Episode ${targetEpisode}` : ' (Full Season Batch Zip preferred)'}...`);

    // Helper: Find dedicated or candidate posts for targetSeason
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

    // Helper to find links across target posts
    let allLinksScraped = [];
    for (const p of targetPosts) {
        try {
            const links = await scrapeAllPostLinks(p.link);
            links.forEach(l => { l._postTitle = p.title; l._postLink = p.link; });
            allLinksScraped.push(...links);
        } catch (e) {
            console.warn(`[AISearch] Error scraping links for ${p.title}:`, e.message);
        }
    }

    // Helper to filter links for targetSeason
    const seasonLinks = allLinksScraped.filter(l => {
        const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
        const sMatch = text.match(/season\s*(\d+)|\bs(\d+)\b/i);
        if (sMatch) {
            const sNum = parseInt(sMatch[1] || sMatch[2], 10);
            return sNum === targetSeason;
        }
        return true;
    });

    const activeLinks = seasonLinks.length > 0 ? seasonLinks : allLinksScraped;

    // --- CASE A: NO EPISODE SPECIFIED -> TARGET SEASON BATCH ZIP ---
    if (!targetEpisode) {
        console.log(`[AISearch] 📦 User did NOT specify an episode. Searching for Season ${targetSeason} Batch Zip / Pack link...`);
        const batchLinks = activeLinks.filter(l => l.isPack || /batch|zip|pack|all\s*episodes|complete\s*season/i.test(`${l.text} ${l.parentText || ''} ${l.heading || ''}`));
        
        let chosenBatch = batchLinks.find(l => l.resolution && l.resolution.toLowerCase() === targetRes) || batchLinks[0];
        
        if (chosenBatch && chosenBatch.href) {
            console.log(`[AISearch] ✅ Found Season ${targetSeason} Batch Zip link: "${chosenBatch.text}" (${chosenBatch.href})`);
            const landing = await resolveLandingLink(chosenBatch.href);
            const mediaUrl = await resolveVcloudLink(landing);
            if (mediaUrl) return { mediaUrl, postTitle: chosenBatch._postTitle || post.title, isBatchZip: true };
        }

        // Fallback if no explicit batch zip link was found: try first link matching targetSeason
        if (activeLinks.length > 0) {
            const fallbackLink = activeLinks.find(l => l.resolution && l.resolution.toLowerCase() === targetRes) || activeLinks[0];
            if (fallbackLink && fallbackLink.href) {
                console.log(`[AISearch] ⚠️ Batch zip link keyword not explicit. Fallback to season link: "${fallbackLink.text}"`);
                const landing = await resolveLandingLink(fallbackLink.href);
                const mediaUrl = await resolveVcloudLink(landing);
                if (mediaUrl) return { mediaUrl, postTitle: fallbackLink._postTitle || post.title, isBatchZip: false };
            }
        }
    }

    // --- CASE B: EPISODE SPECIFIED (e.g. Episode 5) -> TARGET EPISODE 5 VCLOUD ---
    if (targetEpisode) {
        console.log(`[AISearch] 🎯 User specified Episode ${targetEpisode}. Searching for Episode ${targetEpisode} single link (VCloud preferred)...`);

        const isEpMatch = (l) => {
            const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
            const epRegex = new RegExp(`\\b(?:e|ep|episode)\\s*[:\\-–—]?\\s*0?${targetEpisode}\\b|\\bs0?${targetSeason}e0?${targetEpisode}\\b|\\bep\\s*0?${targetEpisode}\\b|\\b${targetEpisode}(?:th|st|nd|rd)?\\s*episode\\b`, 'i');
            return l.episode === `E${String(targetEpisode).padStart(2, '0')}` || epRegex.test(text);
        };

        const epCandidateLinks = activeLinks.filter(isEpMatch);

        // Sort: Prioritize VCloud links first, then matching resolution, then others
        epCandidateLinks.sort((a, b) => {
            const aText = `${a.text} ${a.href}`.toLowerCase();
            const bText = `${b.text} ${b.href}`.toLowerCase();
            const aIsVcloud = aText.includes('vcloud') || aText.includes('v-cloud') || aText.includes('hubcloud');
            const bIsVcloud = bText.includes('vcloud') || bText.includes('v-cloud') || bText.includes('hubcloud');
            if (aIsVcloud && !bIsVcloud) return -1;
            if (!aIsVcloud && bIsVcloud) return 1;
            return 0;
        });

        for (const epLink of epCandidateLinks) {
            if (epLink.href) {
                console.log(`[AISearch] Trying Episode ${targetEpisode} link: "${epLink.text}" (${epLink.href})`);
                try {
                    const landing = await resolveLandingLink(epLink.href);
                    const mediaUrl = await resolveVcloudLink(landing);
                    if (mediaUrl) {
                        console.log(`[AISearch] ✅ Resolved Episode ${targetEpisode} VCloud link: ${mediaUrl}`);
                        return { mediaUrl, postTitle: epLink._postTitle || post.title, isEpisode: true };
                    }
                } catch (eErr) {
                    console.warn(`[AISearch] Failed resolving Episode ${targetEpisode} link:`, eErr.message);
                }
            }
        }

        // Episode single link NOT found or failed resolution! Check if Season Batch Zip is available.
        console.log(`[AISearch] ⚠️ Single link for Episode ${targetEpisode} not available/extractable. Checking if Batch Zip exists...`);
        const batchLink = activeLinks.find(l => l.isPack || /batch|zip|pack|all\s*episodes|complete\s*season/i.test(`${l.text} ${l.parentText || ''} ${l.heading || ''}`));

        if (batchLink && batchLink.href) {
            return {
                mediaUrl: null,
                episodeUnavailable: true,
                batchAvailable: true,
                batchZipLink: batchLink.href,
                batchZipPost: targetPosts.find(p => p.link === batchLink._postLink) || post,
                postTitle: post.title
            };
        } else {
            return {
                mediaUrl: null,
                episodeUnavailable: true,
                batchAvailable: false,
                postTitle: post.title
            };
        }
    }

    // Default fallback to post.link
    return { mediaUrl: post.link, postTitle: post.title };
}

/**
 * Main AI Search & Downloader Handler
 */
async function handleAiSearchCommand(sock, msg, args, userTextInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    let userPrompt = userTextInput || (Array.isArray(args) ? args.join(' ').trim() : args || '');

    // 1. If Voice Note, translate speech to English silently without status message spam
    if (isVoice && audioBuffer) {
        try {
            userPrompt = await translateAudio(audioBuffer, 'audio/ogg');
            console.log(`[AISearch] Voice Translated Speech: "${userPrompt}"`);
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ Voice translation failed: ${err.message}` }, { quoted: msg });
        }
    }

    if (!userPrompt || userPrompt.trim() === '') {
        return sock.sendMessage(chatId, { text: '⚠️ Please provide a movie/series name or send a voice note.\nExample: `.search Superman 2025 in 720p`' }, { quoted: msg });
    }

    // 2. Extract Intent using AI (Title, Year, Quality, Type, Origin) - Done silently
    let intent;
    try {
        intent = await extractSearchIntent(userPrompt);
        console.log(`[AISearch] Extracted Intent:`, intent);
    } catch (e) {
        intent = { query: userPrompt, year: null, resolution: '720p', type: 'movie', origin: 'non-indian' };
    }

    // 2b. RESOLVE ACTUAL CANONICAL TITLE FROM GOOGLE / TMDB DATABASE
    const { fetchTmdbMetadata } = require('../Utils/movie_scraper');
    let tmdbInfo = null;
    try {
        const searchQuery = intent.query || userPrompt;
        console.log(`[AISearch] 🔍 Resolving official title from Google/TMDB for keyword: "${searchQuery}"`);
        tmdbInfo = await fetchTmdbMetadata(searchQuery, intent.type === 'series' ? 'tv' : 'movie');
        if (tmdbInfo && tmdbInfo.title) {
            console.log(`[AISearch] ✅ Google/TMDB Official Title Resolved: "${tmdbInfo.title}" (${tmdbInfo.year || 'N/A'})`);
            intent.query = tmdbInfo.title;
            if (tmdbInfo.year && tmdbInfo.year !== 'N/A') {
                intent.year = tmdbInfo.year;
            }
            if (tmdbInfo.type === 'tv') {
                intent.type = 'series';
            }
        }
    } catch (tmdbErr) {
        console.warn(`[AISearch] TMDB official title resolution warning:`, tmdbErr.message);
    }

    if (!intent.type) {
        intent.type = (tmdbInfo && tmdbInfo.type === 'tv') ? 'series' : 'movie';
    }

    // Default resolution fallback
    if (!intent.resolution) intent.resolution = '720p';

    // 3. Search target sites (Vegamovies / Rogmovies / HDHub4u) using the exact official canonical spelling
    let candidates = await searchMoviesAndSeries(intent.query, intent.origin);

    // Fallback: If 0 hits with official title, retry searching site with raw user keyword
    if ((!candidates || candidates.length === 0) && intent.query !== userPrompt) {
        console.log(`[AISearch] 🔄 0 hits for "${intent.query}". Retrying site search with raw keyword: "${userPrompt}"`);
        candidates = await searchMoviesAndSeries(userPrompt, intent.origin);
    }

    if (!candidates || candidates.length === 0) {
        return sock.sendMessage(chatId, { text: `❌ No download posts found for "*${intent.query}*".` }, { quoted: msg });
    }

    // Select candidate post
    let chosenPost = candidates[0];
    if (candidates.length > 1) {
        chosenPost = await selectBestMatch({ title: intent.query, year: intent.year }, candidates, intent.resolution);
    }

    // 3b. Detect available seasons for TV Series across candidate posts
    const detectedSeasonsSet = new Set();
    if (intent.type === 'series') {
        candidates.forEach(c => {
            const t = (c.title || '').toLowerCase();
            const rangeMatch = t.match(/season[s]?\s*(\d+)\s*[-–]\s*(\d+)/i);
            if (rangeMatch) {
                const s1 = parseInt(rangeMatch[1], 10);
                const s2 = parseInt(rangeMatch[2], 10);
                for (let i = Math.min(s1, s2); i <= Math.max(s1, s2); i++) detectedSeasonsSet.add(i);
            } else {
                const sMatch = t.match(/season\s*(\d+)|\bs(\d+)\b/i);
                if (sMatch) detectedSeasonsSet.add(parseInt(sMatch[1] || sMatch[2], 10));
            }
        });
    }
    const availableSeasons = Array.from(detectedSeasonsSet).sort((a, b) => a - b);
    if (availableSeasons.length > 0 && !intent.season) {
        intent.season = availableSeasons[0]; // Default to earliest available season
    }

    // 4. Pre-Confirmation Gate
    const confirmKey = `${chatId}_${Date.now().toString().slice(-4)}`;
    
    let seasonInfoText = '';
    if (intent.type === 'series' && availableSeasons.length > 0) {
        seasonInfoText = `📅 *Available Seasons:* ${availableSeasons.map(s => `Season ${s}`).join(', ')}\n` +
                         `🎯 *Selected:* Season ${intent.season || 1}\n\n`;
    }

    const preConfirmText = `❓ *Confirm Search Result*\n\n` +
                           `🎬 *Title:* *${chosenPost.title}*\n` +
                           `📺 *Quality:* ${intent.resolution}\n` +
                           `⭐ *Type:* ${(intent.type || 'movie').toUpperCase()}\n` +
                           `${seasonInfoText}` +
                           `🌐 *Source:* ${chosenPost.site}\n\n` +
                           `1️⃣ *Quote/Reply* with *yes* or *1* to confirm and start download.\n` +
                           (intent.type === 'series' && availableSeasons.length > 1 ? `2️⃣ *Quote/Reply* with season number (e.g. *season 2* or *2*) to change season.\n` : '') +
                           `3️⃣ *Quote/Reply* with *no* or *0* to cancel.\n\n` +
                           `⚠️ *Note:* You MUST quote/reply to this message for your choice to take effect!`;

    const sentMsg = chosenPost.thumbnail
        ? await sock.sendMessage(chatId, { image: { url: chosenPost.thumbnail }, caption: preConfirmText }, { quoted: msg })
        : await sock.sendMessage(chatId, { text: preConfirmText }, { quoted: msg });

    if (sentMsg && sentMsg.key && sentMsg.key.id) {
        pendingPreConfirmations.set(confirmKey, {
            chatId,
            sender,
            post: chosenPost,
            intent,
            candidates,
            availableSeasons,
            messageId: sentMsg.key.id,
            timestamp: Date.now()
        });
    }
}

/**
 * Pre-Confirmation Gate Response Handler (User replies Yes/1, No/0, or a corrected search query/voice note)
 * STRICT REQUIREMENT: User MUST quote/reply to the bot's pre-confirmation message! Unquoted messages are ignored.
 */
async function handlePreConfirmationReply(sock, msg, confirmKey, isApproved, updatedInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const session = pendingPreConfirmations.get(confirmKey);

    if (!session) {
        return sock.sendMessage(chatId, { text: '⚠️ Confirmation session expired or not found.' }, { quoted: msg });
    }

    // Check if user changed season (e.g. "season 2" or "2")
    if (isApproved === null && updatedInput && session.intent.type === 'series') {
        const seasonNumMatch = updatedInput.match(/\bseason\s*(\d+)\b/i) || updatedInput.match(/^\s*(\d+)\s*$/);
        if (seasonNumMatch) {
            const requestedSeason = parseInt(seasonNumMatch[1], 10);
            session.intent.season = requestedSeason;
            console.log(`[AISearch] User changed TV Series target to Season ${requestedSeason}`);
            isApproved = true; // Auto approve after season choice
        }
    }

    // If user provided a title/keyword correction (text or voice note), re-trigger AI search with updated input
    if (isApproved === null && (updatedInput || (isVoice && audioBuffer))) {
        pendingPreConfirmations.delete(confirmKey);
        return handleAiSearchCommand(sock, msg, [], updatedInput, isVoice, audioBuffer);
    }

    pendingPreConfirmations.delete(confirmKey);

    if (!isApproved) {
        return sock.sendMessage(chatId, { text: '❌ *Search request cancelled.*' }, { quoted: msg });
    }

    const { post, intent, candidates } = session;
    const { pCommandHandler, downloadCommandHandler } = require('./danie_download');
    const replyFn = async (t) => {
        if (typeof t === 'string' && t.trim()) {
            try {
                await sock.sendMessage(chatId, { text: t }, { quoted: msg });
            } catch (_) {}
        }
    };

    // If session has batchZipLink from fallback confirmation approval:
    if (session.batchZipLink) {
        console.log(`[AISearch] User confirmed downloading fallback Season Batch Zip: ${session.batchZipLink}`);
        try {
            const landing = await resolveLandingLink(session.batchZipLink);
            const mediaUrl = await resolveVcloudLink(landing);
            if (mediaUrl) {
                console.log(`[AISearch] Triggering .d command handler with fallback Batch Zip direct link: ${mediaUrl}`);
                return await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, mediaUrl, replyFn);
            }
        } catch (bErr) {
            console.warn('[AISearch] Fallback batch zip resolution error:', bErr.message);
        }
    }

    // 1. Run .p command for TMDB poster, caption, and YouTube trailer delivery
    try {
        console.log(`[AISearch] Triggering .p command for post link: ${post.link}`);
        await pCommandHandler(sock, msg, chatId, msg.key.participant || chatId, post.link, replyFn);
    } catch (pErr) {
        console.warn('[AISearch] .p command execution notice:', pErr.message);
    }

    // 2. Extract media download link using individual post first, then combined post fallback
    let mediaUrl = post.link;
    let postTitle = post.title;
    try {
        if (intent.type === 'series') {
            const seasonResult = await getSeriesSeasonMediaUrl(post, intent, candidates);
            
            if (seasonResult.episodeUnavailable) {
                if (seasonResult.batchAvailable && seasonResult.batchZipLink) {
                    // Single episode requested is unavailable, but full Season Batch Zip is available!
                    // Prompt user with Yes/No confirmation
                    const fallbackConfirmKey = `epfallback_${chatId}_${Date.now()}`;
                    const promptText = `⚠️ *Episode ${intent.episode} single download link is not available.*` +
                                       `\n📦 *Full Season ${intent.season || 1} Batch Zip (All Episodes) is available!*` +
                                       `\n\n1️⃣ *Quote/Reply* with *yes* or *1* to download the full Season Batch Zip.` +
                                       `\n2️⃣ *Quote/Reply* with *no* or *0* to cancel.` +
                                       `\n\n⚠️ *Note:* You MUST quote/reply to this message for your choice to take effect!`;

                    const sentMsg = await sock.sendMessage(chatId, { text: promptText }, { quoted: msg });
                    if (sentMsg && sentMsg.key && sentMsg.key.id) {
                        pendingPreConfirmations.set(fallbackConfirmKey, {
                            chatId,
                            sender: msg.key.participant || chatId,
                            post: seasonResult.batchZipPost || post,
                            intent: { ...intent, episode: null }, // clear episode so it downloads batch zip
                            candidates,
                            batchZipLink: seasonResult.batchZipLink,
                            messageId: sentMsg.key.id,
                            timestamp: Date.now()
                        });
                    }
                    return;
                } else {
                    return sock.sendMessage(chatId, { text: `❌ *Episode ${intent.episode} of Season ${intent.season || 1} is not available.*` }, { quoted: msg });
                }
            }
            mediaUrl = seasonResult.mediaUrl;
            if (seasonResult.postTitle) postTitle = seasonResult.postTitle;
        } else {
            // Movie: match requested resolution (480p, 720p, 1080p) or fallback to first link
            const allLinks = await scrapeAllPostLinks(post.link);
            const targetRes = (intent.resolution || '720p').toLowerCase();
            const matchedResLink = allLinks.find(l => l.resolution && l.resolution.toLowerCase() === targetRes) || allLinks[0];
            if (matchedResLink && matchedResLink.href) {
                const landing = await resolveLandingLink(matchedResLink.href);
                mediaUrl = await resolveVcloudLink(landing);
                console.log(`[AISearch] Extracted Movie ${intent.resolution} link: ${mediaUrl}`);
            }
        }
    } catch (scrapeErr) {
        console.warn('[AISearch] Link extraction fallback to post URL:', scrapeErr.message);
    }

    // 3. Trigger .d command handler for queuing and media delivery
    const isHigherResolution = ['1080p', '4k', '2160p'].includes(intent.resolution.toLowerCase());

    if (isHigherResolution) {
        const browserMsg = `🌐 *Direct Browser Download Link (External Download)*\n\n` +
                           `🎬 *Title:* *${postTitle}*\n` +
                           `📺 *Quality:* *${intent.resolution}*\n` +
                           `🔗 *Direct Download Link:* \`${mediaUrl}\` \n\n` +
                           `_Note: Direct WhatsApp file delivery is supported for 480p and 720p files (< 2GB)._`;
        await sock.sendMessage(chatId, { text: browserMsg }, { quoted: msg });
    } else {
        const downloadQuery = mediaUrl;
        console.log(`[AISearch] Triggering .d command handler with direct link: ${downloadQuery}`);
        await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, downloadQuery, replyFn);
    }
}

module.exports = {
    handleAiSearchCommand,
    handlePreConfirmationReply,
    pendingPreConfirmations,
    pendingPostSelections
};
