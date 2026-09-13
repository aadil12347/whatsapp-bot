const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');

// In-memory state tracking
const pendingPreConfirmations = new Map();
const pendingPostSelections = new Map();

/**
 * Helper to resolve media URL for TV Series seasons:
 * 1. Checks individual season post dedicated to targetSeason first.
 * 2. If individual post extraction fails or doesn't exist, falls back to combined multi-season post.
 */
async function getSeriesSeasonMediaUrl(post, intent, candidates = []) {
    const targetSeason = intent.season || 1;
    console.log(`[AISearch] Resolving TV Series media URL for Season ${targetSeason}...`);

    // Step 1: Look for individual season post matching targetSeason among candidate posts
    const individualPost = candidates.find(c => {
        const t = (c.title || '').toLowerCase();
        const isIndividual = !/season[s]?\s*\d+\s*[-–]\s*\d+|\ball\s*season[s]?\b|\bcomplete\b/i.test(t);
        const seasonMatch = t.match(/season\s*(\d+)|\bs(\d+)\b/i);
        return isIndividual && seasonMatch && parseInt(seasonMatch[1] || seasonMatch[2], 10) === targetSeason;
    });

    if (individualPost && individualPost.link) {
        console.log(`[AISearch] 🎯 Step 1: Trying dedicated individual Season ${targetSeason} post: "${individualPost.title}" (${individualPost.link})`);
        try {
            const allLinks = await scrapeAllPostLinks(individualPost.link);
            const batchZipLink = allLinks.find(l => l.isPack || /batch|zip|pack|all\s*episodes/i.test(l.text || '') || /batch|zip|pack/i.test(l.parentText || ''));
            if (batchZipLink && batchZipLink.href) {
                const landing = await resolveLandingLink(batchZipLink.href);
                const mediaUrl = await resolveVcloudLink(landing);
                if (mediaUrl) return { mediaUrl, postTitle: individualPost.title };
            }
            const seriesResult = await extractSeriesVcloudLinks(individualPost.link);
            if (seriesResult && seriesResult.episodes && seriesResult.episodes.length > 0) {
                return { mediaUrl: seriesResult.episodes[0].directUrl, postTitle: individualPost.title };
            }
        } catch (indErr) {
            console.warn(`[AISearch] Individual Season ${targetSeason} post extraction failed: ${indErr.message}. Trying combined post fallback...`);
        }
    }

    // Step 2: Fallback to combined multi-season post if individual post failed or was not found
    const combinedPost = candidates.find(c => {
        const t = (c.title || '').toLowerCase();
        const rangeMatch = t.match(/season[s]?\s*(\d+)\s*[-–]\s*(\d+)/i);
        if (rangeMatch) {
            const startS = parseInt(rangeMatch[1], 10);
            const endS = parseInt(rangeMatch[2], 10);
            return targetSeason >= startS && targetSeason <= endS;
        }
        return /all\s*season[s]?|complete\s*series|seasons/i.test(t);
    }) || post;

    if (combinedPost && combinedPost.link) {
        console.log(`[AISearch] 🔄 Step 2: Fallback to combined multi-season post: "${combinedPost.title}" (${combinedPost.link})`);
        try {
            const allLinks = await scrapeAllPostLinks(combinedPost.link);
            const seasonLink = allLinks.find(l => {
                const combined = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
                const sMatch = combined.match(/season\s*(\d+)|\bs(\d+)\b/i);
                return sMatch && parseInt(sMatch[1] || sMatch[2], 10) === targetSeason;
            }) || allLinks.find(l => l.isPack || /batch|zip|pack/i.test(l.text || '')) || allLinks[0];

            if (seasonLink && seasonLink.href) {
                const landing = await resolveLandingLink(seasonLink.href);
                const mediaUrl = await resolveVcloudLink(landing);
                if (mediaUrl) return { mediaUrl, postTitle: combinedPost.title };
            }
            const seriesResult = await extractSeriesVcloudLinks(combinedPost.link);
            if (seriesResult && seriesResult.episodes && seriesResult.episodes.length > 0) {
                const matchedEp = seriesResult.episodes.find(e => e.epLabel && e.epLabel.includes(`S${String(targetSeason).padStart(2, '0')}`)) || seriesResult.episodes[0];
                return { mediaUrl: matchedEp.directUrl, postTitle: combinedPost.title };
            }
        } catch (combErr) {
            console.warn(`[AISearch] Combined multi-season post extraction failed: ${combErr.message}`);
        }
    }

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
        }
    } catch (tmdbErr) {
        console.warn(`[AISearch] TMDB official title resolution warning:`, tmdbErr.message);
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
                           `⭐ *Type:* ${intent.type.toUpperCase()}\n` +
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
