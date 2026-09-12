const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { fetchTmdbMetadata, downloadYoutubeVideoUrl, searchMoviesAndSeries, scrapePostPage, resolveLandingLink, resolveVcloudLink, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

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

    // 2. Extract Intent using AI (Title, Year, Quality, Type, Origin)
    await sock.sendMessage(chatId, { text: '⏳ *[1/3] Analyzing search intent & content origin...*' }, { quoted: msg });
    let intent;
    try {
        intent = await extractSearchIntent(userPrompt);
        console.log(`[AISearch] Extracted Intent:`, intent);
    } catch (e) {
        intent = { query: userPrompt, year: null, resolution: '720p', type: 'movie', origin: 'non-indian' };
    }

    // Default resolution fallback
    if (!intent.resolution) intent.resolution = '720p';

    // 3. Search target sites (Rogmovies for Indian, Vegamovies for Non-Indian, HDHub4u fallback)
    await sock.sendMessage(chatId, { text: `⏳ *[2/3] Searching ${intent.origin === 'indian' ? 'Rogmovies' : 'Vegamovies'} (${intent.resolution})...*` }, { quoted: msg });
    const candidates = await searchMoviesAndSeries(intent.query, intent.origin);

    if (!candidates || candidates.length === 0) {
        return sock.sendMessage(chatId, { text: `❌ No download posts found for "*${intent.query}*".` }, { quoted: msg });
    }

    // If multiple candidates exist, ask user to select option or pick best match
    let chosenPost = candidates[0];
    if (candidates.length > 1) {
        chosenPost = await selectBestMatch({ title: intent.query, year: intent.year }, candidates, intent.resolution);
    }

    // 4. Pre-Confirmation Gate BEFORE fetching TMDB asset & media extraction
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
                           `👉 *Reply "*yes*" or "*1*" to proceed with TMDB poster, trailer & media download, or "*no*" to cancel.*`;

    if (chosenPost.thumbnail) {
        await sock.sendMessage(chatId, { image: { url: chosenPost.thumbnail }, caption: preConfirmText }, { quoted: msg });
    } else {
        await sock.sendMessage(chatId, { text: preConfirmText }, { quoted: msg });
    }
}

/**
 * Pre-Confirmation Gate Response Handler (User replies Yes/1 or No)
 */
async function handlePreConfirmationReply(sock, msg, confirmKey, isApproved) {
    const chatId = msg.key.remoteJid;
    const session = pendingPreConfirmations.get(confirmKey);

    if (!session) {
        return sock.sendMessage(chatId, { text: '⚠️ Confirmation session expired or not found.' }, { quoted: msg });
    }

    pendingPreConfirmations.delete(confirmKey);

    if (!isApproved) {
        return sock.sendMessage(chatId, { text: '❌ *Search request cancelled.*' }, { quoted: msg });
    }

    const { post, intent } = session;
    await sock.sendMessage(chatId, { text: `🚀 *Confirmed! Processing TMDB poster, trailer & download link for:* *${post.title}*...` }, { quoted: msg });

    // Step A: Scrape detail page for IMDb ID (tt...) to convert to TMDB metadata
    let imdbId = null;
    try {
        const scrapeInfo = await scrapePostPage(post.link);
        if (scrapeInfo && scrapeInfo.imdbId) {
            imdbId = scrapeInfo.imdbId;
            console.log(`[AISearch] Extracted IMDb ID from post page: ${imdbId}`);
        }
    } catch (_) {}

    // Step B: Fetch TMDB Metadata & send Poster + Trailer
    const tmdb = await fetchTmdbMetadata(intent.query, intent.type, imdbId);

    if (tmdb) {
        const caption = `🎬 *Title:* *${tmdb.title}*\n` +
                        `📅 *Year:* *${tmdb.year}*\n` +
                        `🎭 *Genre:* *${tmdb.genres}*\n` +
                        `⭐ *Type:* *${tmdb.type.toUpperCase()}*\n\n` +
                        `📝 *Overview:* ${tmdb.overview ? tmdb.overview.substring(0, 300) + '...' : 'N/A'}`;

        if (tmdb.posterUrl) {
            await sock.sendMessage(chatId, { image: { url: tmdb.posterUrl }, caption }, { quoted: msg });
        } else {
            await sock.sendMessage(chatId, { text: caption }, { quoted: msg });
        }

        // Send Trailer Video
        if (tmdb.trailerUrl) {
            try {
                const directTrailerUrl = await downloadYoutubeVideoUrl(tmdb.trailerUrl);
                if (directTrailerUrl) {
                    await sock.sendMessage(chatId, { video: { url: directTrailerUrl }, caption: `🎥 *Official Trailer:* *${tmdb.title}*` }, { quoted: msg });
                }
            } catch (err) {
                console.warn('[AISearch] Trailer delivery skipped:', err.message);
            }
        }
    }

    // Step C: Resolution Delivery Branch
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
                               `🎬 *Title:* *${tmdb?.title || post.title}*\n` +
                               `📺 *Quality:* *${intent.resolution}*\n` +
                               `🔗 *Direct Download Link:* \`${finalUrl}\` \n\n` +
                               `_Note: Direct WhatsApp file delivery is supported for 480p and 720p files (< 2GB)._`;
            await sock.sendMessage(chatId, { text: browserMsg }, { quoted: msg });
        } else {
            // Trigger in-chat file delivery (480p or 720p)
            const { downloadCommandHandler } = require('./danie_download');
            await sock.sendMessage(chatId, { text: `📥 *Downloading & delivering ${intent.resolution} file to chat...*` }, { quoted: msg });
            await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, `${tmdb?.title || post.title} = ${finalUrl}`, async (t) => sock.sendMessage(chatId, { text: t }));
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
