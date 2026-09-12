const { transcribeAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { fetchTmdbMetadata, downloadYoutubeVideoUrl, searchMoviesAndSeries, scrapePostPage, resolveLandingLink, resolveVcloudLink, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// In-memory pending confirmation store
const pendingConfirmations = new Map();

async function handleAiSearchCommand(sock, msg, args, userTextInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    let userPrompt = userTextInput || args.join(' ').trim();

    // 1. If Voice Note, transcribe audio
    if (isVoice && audioBuffer) {
        await sock.sendMessage(chatId, { text: '🎙️ *Processing voice note transcription...*' }, { quoted: msg });
        try {
            userPrompt = await transcribeAudio(audioBuffer, 'audio/ogg');
            await sock.sendMessage(chatId, { text: `🎙️ *Transcribed Speech:* "${userPrompt}"` }, { quoted: msg });
        } catch (err) {
            return sock.sendMessage(chatId, { text: `❌ *Voice transcription failed:* ${err.message}` }, { quoted: msg });
        }
    }

    if (!userPrompt) {
        return sock.sendMessage(chatId, { text: '⚠️ Please provide a movie/series name or send a voice note.\nExample: `.search Superman 2025 in 720p`' }, { quoted: msg });
    }

    // 2. Extract Intent using AI
    await sock.sendMessage(chatId, { text: '⏳ *[1/4] Analyzing search request & intent...*' }, { quoted: msg });
    let intent;
    try {
        intent = await extractSearchIntent(userPrompt);
        console.log(`[AISearch] Extracted Intent:`, intent);
    } catch (e) {
        intent = { query: userPrompt, year: null, resolution: '720p', type: 'movie' };
    }

    // 3. Immediate TMDB Poster & Trailer Delivery
    await sock.sendMessage(chatId, { text: `⏳ *[2/4] Fetching TMDB metadata & trailer for:* *${intent.query}*...` }, { quoted: msg });
    const tmdb = await fetchTmdbMetadata(intent.query, intent.type);

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

        // Fetch & send trailer video
        if (tmdb.trailerUrl) {
            console.log(`[AISearch] Fetching trailer video: ${tmdb.trailerUrl}`);
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

    // 4. Concurrently search Vegamovies, Rogmovies, and HDHub4u
    await sock.sendMessage(chatId, { text: `⏳ *[3/4] Searching Vegamovies, Rogmovies & HDHub4u for ${intent.resolution}...*` }, { quoted: msg });
    const candidates = await searchMoviesAndSeries(intent.query);

    if (!candidates || candidates.length === 0) {
        return sock.sendMessage(chatId, { text: `❌ No download posts found for "*${intent.query}*" on Vegamovies, Rogmovies, or HDHub4u.` }, { quoted: msg });
    }

    // 5. Select Best Match using AI
    const bestPost = await selectBestMatch(tmdb || { title: intent.query, year: intent.year }, candidates, intent.resolution);
    console.log(`[AISearch] Selected Best Post:`, bestPost);

    // 6. Scrape Post & Extract Download Link
    await sock.sendMessage(chatId, { text: `⏳ *[4/4] Extracting ${intent.resolution} VCloud / Download link from ${bestPost.site}...*` }, { quoted: msg });

    try {
        let finalDownloadUrl = null;
        let postDetails = null;

        try {
            if (intent.type === 'series') {
                const seriesResult = await extractSeriesVcloudLinks(bestPost.link);
                if (seriesResult && seriesResult.episodes && seriesResult.episodes.length > 0) {
                    finalDownloadUrl = seriesResult.episodes[0].directUrl;
                }
            } else {
                postDetails = await scrapePostPage(bestPost.link);
                if (postDetails && postDetails.chosenUrl) {
                    const landing = await resolveLandingLink(postDetails.chosenUrl);
                    finalDownloadUrl = await resolveVcloudLink(landing);
                }
            }
        } catch (scrapeErr) {
            console.warn('[AISearch] Page scraping fallback to post link:', scrapeErr.message);
        }

        if (!finalDownloadUrl) {
            finalDownloadUrl = bestPost.link;
        }

        // Store confirmation token
        const confirmId = Date.now().toString().slice(-4);
        pendingConfirmations.set(confirmId, {
            chatId,
            sender,
            title: tmdb?.title || bestPost.title,
            downloadUrl: finalDownloadUrl,
            resolution: intent.resolution,
            timestamp: Date.now()
        });

        const confirmMessage = `✅ *Best Match Found!*\n\n` +
                               `🎬 *Title:* *${tmdb?.title || bestPost.title}*\n` +
                               `📺 *Quality:* *${intent.resolution}*\n` +
                               `🌐 *Source:* ${bestPost.site}\n` +
                               `🔗 *Direct Link:* \`${finalDownloadUrl.substring(0, 60)}...\` \n\n` +
                               `👉 *Reply "*1*" or "*.confirm ${confirmId}*" to start instant download & file delivery to chat!*`;

        await sock.sendMessage(chatId, { text: confirmMessage }, { quoted: msg });

    } catch (err) {
        console.error('[AISearch] Extraction error:', err);
        return sock.sendMessage(chatId, { text: `❌ Failed to extract download link: ${err.message}` }, { quoted: msg });
    }
}

module.exports = {
    handleAiSearchCommand,
    pendingConfirmations
};
