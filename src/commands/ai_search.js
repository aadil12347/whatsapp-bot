const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, resolveLandingLink, resolveVcloudLink, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');

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

    // 1. If Voice Note, translate speech to English via Groq Whisper Translation
    if (isVoice && audioBuffer) {
        await sock.sendMessage(chatId, { text: '🎙️ *Translating voice note to English...*' }, { quoted: msg });
        try {
            userPrompt = await translateAudio(audioBuffer, 'audio/ogg');
            await sock.sendMessage(chatId, { text: `🎙️ *Translated Speech:* "${userPrompt}"` }, { quoted: msg });
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ *Voice translation failed:* ${err.message}` }, { quoted: msg });
        }
    }

    if (!userPrompt || userPrompt.trim() === '') {
        return sock.sendMessage(chatId, { text: '⚠️ Please provide a movie/series name or send a voice note.\nExample: `.search Superman 2025 in 720p`' }, { quoted: msg });
    }

    // 2. Extract Intent using AI (Title, Year, Quality, Type, Origin) - Done silently without status spam
    let intent;
    try {
        intent = await extractSearchIntent(userPrompt);
        console.log(`[AISearch] Extracted Intent:`, intent);
    } catch (e) {
        intent = { query: userPrompt, year: null, resolution: '720p', type: 'movie', origin: 'non-indian' };
    }

    // Default resolution fallback
    if (!intent.resolution) intent.resolution = '720p';

    // 3. Search target sites (Rogmovies for Indian, Vegamovies for Non-Indian) - Done silently
    const candidates = await searchMoviesAndSeries(intent.query, intent.origin);

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

    const preConfirmText = `❓ *Confirm Movie/Series Search Result*\n\n` +
                           `🎬 *Title:* *${chosenPost.title}*\n` +
                           `📺 *Requested Quality:* *${intent.resolution}*\n` +
                           `⭐ *Type:* *${intent.type.toUpperCase()}*\n` +
                           `🌐 *Source Site:* ${chosenPost.site}\n\n` +
                           `👉 *Reply "*yes*" or "*1*" to confirm & download.*\n` +
                           `👉 *Or reply with a corrected name (text/voice) to change search.*\n` +
                           `👉 *Reply "*no*" to cancel.*`;

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
        await sock.sendMessage(chatId, { text: '🔄 *Updating search query...*' }, { quoted: msg });
        return handleAiSearchCommand(sock, msg, [], updatedInput, isVoice, audioBuffer);
    }

    pendingPreConfirmations.delete(confirmKey);

    if (!isApproved) {
        return sock.sendMessage(chatId, { text: '❌ *Search request cancelled.*' }, { quoted: msg });
    }

    const { post, intent } = session;
    const { downloadCommandHandler } = require('./danie_download');

    await sock.sendMessage(chatId, { text: `🚀 *Confirmed! Processing TMDB poster, trailer & download link for:* *${post.title}*...` }, { quoted: msg });

    // 1. Trigger .p command functionality for fetching & sending TMDB poster + caption + trailer
    try {
        await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, post.link, async (t) => {
            // Filter progress text so only poster/trailer/link updates are sent
            if (t && (t.includes('Poster') || t.includes('Trailer') || t.includes('TMDB') || t.includes('Downloading'))) {
                await sock.sendMessage(chatId, { text: t });
            }
        });
    } catch (err) {
        console.warn('[AISearch] .p command handler processing notice:', err.message);
    }

    // 2. Resolution Delivery Branch
    const isHigherResolution = ['1080p', '4k', '2160p'].includes(intent.resolution.toLowerCase());

    try {
        let finalUrl = post.link;
        try {
            if (intent.type === 'series') {
                const seriesResult = await extractSeriesVcloudLinks(post.link);
                if (seriesResult && seriesResult.episodes && seriesResult.episodes.length > 0) {
                    finalUrl = seriesResult.episodes[0].directUrl;
                }
            } else {
                const postDetails = await scrapePostPage(post.link);
                if (postDetails && postDetails.chosenUrl) {
                    const landing = await resolveLandingLink(postDetails.chosenUrl);
                    finalUrl = await resolveVcloudLink(landing);
                }
            }
        } catch (scrapeErr) {
            console.warn('[AISearch] Page link extraction fallback to post URL:', scrapeErr.message);
        }

        if (isHigherResolution) {
            // Send direct external browser download link
            const browserMsg = `🌐 *Direct Browser Download Link (External Download)*\n\n` +
                               `🎬 *Title:* *${post.title}*\n` +
                               `📺 *Quality:* *${intent.resolution}*\n` +
                               `🔗 *Direct Download Link:* \`${finalUrl}\` \n\n` +
                               `_Note: Direct WhatsApp file delivery is supported for 480p and 720p files (< 2GB)._`;
            await sock.sendMessage(chatId, { text: browserMsg }, { quoted: msg });
        } else {
            // Trigger .d command handler for media file download & delivery
            await sock.sendMessage(chatId, { text: `📥 *Downloading & delivering ${intent.resolution} file via .d command...*` }, { quoted: msg });
            await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, `${post.title} = ${finalUrl}`, async (t) => {
                await sock.sendMessage(chatId, { text: t });
            });
        }

    } catch (err) {
        console.error('[AISearch] Media delivery error:', err);
        return sock.sendMessage(chatId, { text: `❌ Failed to extract media link: ${err.message}` }, { quoted: msg });
    }
}

module.exports = {
    handleAiSearchCommand,
    handlePreConfirmationReply,
    pendingPreConfirmations,
    pendingPostSelections
};
