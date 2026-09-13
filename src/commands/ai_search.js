const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');

// In-memory state tracking
const pendingPreConfirmations = new Map();
const pendingPostSelections = new Map();

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
    // Query TMDB/Google API using the AI-extracted title or raw keyword to copy the exact official spelling
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

    // 4. Pre-Confirmation Gate
    const confirmKey = `${chatId}_${Date.now().toString().slice(-4)}`;
    pendingPreConfirmations.set(confirmKey, {
        chatId,
        sender,
        post: chosenPost,
        intent,
        timestamp: Date.now()
    });

    const preConfirmText = `❓ *Confirm Search Result*\n\n` +
                           `🎬 *Title:* *${chosenPost.title}*\n` +
                           `📺 *Quality:* ${intent.resolution}\n` +
                           `⭐ *Type:* ${intent.type.toUpperCase()}\n` +
                           `🌐 *Source:* ${chosenPost.site}\n\n` +
                           `1️⃣ Reply *yes* or *1* to confirm and start download.\n` +
                           `2️⃣ Reply *no* or *0* to cancel.\n` +
                           `3️⃣ Or reply with a corrected name (text or voice) to search again.`;

    if (chosenPost.thumbnail) {
        await sock.sendMessage(chatId, { image: { url: chosenPost.thumbnail }, caption: preConfirmText }, { quoted: msg });
    } else {
        await sock.sendMessage(chatId, { text: preConfirmText }, { quoted: msg });
    }
}

/**
 * Pre-Confirmation Gate Response Handler (User replies Yes/1, No/0, or a corrected search query/voice note)
 */
async function handlePreConfirmationReply(sock, msg, confirmKey, isApproved, updatedInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const session = pendingPreConfirmations.get(confirmKey);

    if (!session) {
        return sock.sendMessage(chatId, { text: '⚠️ Confirmation session expired or not found.' }, { quoted: msg });
    }

    // If user provided a correction (text or voice note), re-trigger AI search with updated input
    if (isApproved === null && (updatedInput || (isVoice && audioBuffer))) {
        pendingPreConfirmations.delete(confirmKey);
        return handleAiSearchCommand(sock, msg, [], updatedInput, isVoice, audioBuffer);
    }

    pendingPreConfirmations.delete(confirmKey);

    if (!isApproved) {
        return sock.sendMessage(chatId, { text: '❌ *Search request cancelled.*' }, { quoted: msg });
    }

    const { post, intent } = session;
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

    // 2. Extract media download link (Batch Zip for series, default resolution for movies)
    let mediaUrl = post.link;
    try {
        const allLinks = await scrapeAllPostLinks(post.link);
        if (intent.type === 'series') {
            // Check for Batch Zip / Season Zip link first
            const batchZipLink = allLinks.find(l => l.isPack || /batch|zip|pack|all\s*episodes/i.test(l.text || '') || /batch|zip|pack/i.test(l.parentText || ''));
            if (batchZipLink && batchZipLink.href) {
                const landing = await resolveLandingLink(batchZipLink.href);
                mediaUrl = await resolveVcloudLink(landing);
                console.log(`[AISearch] Extracted Batch Zip link for series: ${mediaUrl}`);
            } else {
                const seriesResult = await extractSeriesVcloudLinks(post.link);
                if (seriesResult && seriesResult.episodes && seriesResult.episodes.length > 0) {
                    mediaUrl = seriesResult.episodes[0].directUrl;
                }
            }
        } else {
            // Movie: match requested resolution (480p, 720p, 1080p) or fallback to first link
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
                           `🎬 *Title:* *${post.title}*\n` +
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
