const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink, extractSubOptions, fetchHtmlWithRetry } = require('../Utils/movie_scraper');
const cheerio = require('cheerio');

// In-memory state tracking
const pendingPreConfirmations = new Map();
const pendingPostSelections = new Map();

/**
 * Builds a structured VCloud-only catalog for a TV series post:
 * - Scrapes post page buttons
 * - Opens detail landing pages
 * - Filters strictly VCloud direct links
 * - Implements Resolution Fallback System for single episodes (720p -> 480p -> 1080p) matching any non-pack button ("Single Episode", "V-Cloud", "G-Direct")
 * - Categorizes into Individual Episode options (1..N) & All Available Batch Zip options named "All Episodes (RES)"
 */
async function buildVcloudCatalog(post, intent, candidates = []) {
    const targetSeason = intent.season || 1;
    const isExplicitRes = intent.resolutionExplicit || (intent.userPrompt && /\b(480p|720p|1080p|2160p|4k)\b/i.test(intent.userPrompt));
    const targetRes = (intent.resolution || '720p').toLowerCase();
    
    console.log(`[AISearch] Building VCloud catalog for Season ${targetSeason} (Explicit Quality: ${isExplicitRes ? targetRes : 'No - Fallback 720p->480p->1080p'})...`);

    const targetPosts = [];
    const individualPost = candidates.find(c => {
        const t = (c.title || '').toLowerCase();
        const isIndividual = !/season[s]?\s*\d+\s*[-–]\s*\d+|\ball\s*season[s]?\b|\bcomplete\s*series\b|\bcomplete\s*pack\b/i.test(t);
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

    let allLinks = [];
    for (const p of targetPosts) {
        try {
            const links = await scrapeAllPostLinks(p.link);
            links.forEach(l => { l._postTitle = p.title; l._postLink = p.link; });
            allLinks.push(...links);
        } catch (e) {
            console.warn(`[AISearch] Error scraping post links for ${p.title}:`, e.message);
        }
    }

    const seasonLinks = allLinks.filter(l => {
        const text = `${l.text} ${l.parentText || ''} ${l.heading || ''}`.toLowerCase();
        const sMatch = text.match(/season\s*(\d+)|\bs(\d+)\b/i);
        if (sMatch) {
            return parseInt(sMatch[1] || sMatch[2], 10) === targetSeason;
        }
        return true;
    });

    const activeLinks = seasonLinks.length > 0 ? seasonLinks : allLinks;

    // 1. Deduplicate Batch Zip Links across all resolutions & name as "All Episodes (RES)"
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
                    resolution: resStr,
                    postTitle: bl._postTitle || post.title
                });
            }
        }
    });

    // Sort batch zips by quality (480p, 720p, 1080p, 4k)
    const resOrder = { '480p': 1, '720p': 2, '1080p': 3, '2160p': 4, '4k': 4 };
    batchZips.sort((a, b) => (resOrder[a.resolution] || 5) - (resOrder[b.resolution] || 5));

    // 2. Single Episode Quality Fallback System (720p -> 480p -> 1080p)
    // Matches ANY non-pack landing button ("Single Episode", "V-Cloud", "G-Direct", "Download Episodes")
    const resPriority = isExplicitRes ? [targetRes] : ['720p', '480p', '1080p', '2160p'];
    const episodes = [];
    let chosenQuality = null;

    for (const res of resPriority) {
        const epLandingButtons = activeLinks.filter(l => !l.isPack && (l.resolution || '').toLowerCase() === res);

        for (const epBtn of epLandingButtons) {
            if (epBtn && epBtn.href) {
                try {
                    console.log(`[AISearch] Trying single episode landing page (${res}): "${epBtn.text}" (${epBtn.href})`);
                    const html = await fetchHtmlWithRetry(epBtn.href);
                    const $ = cheerio.load(html);
                    const vcloudHrefs = [];
                    const vcloudElements = [];

                    $('a[href*="vcloud"], a[href*="hubcloud"]').each((_, el) => {
                        const href = $(el).attr('href');
                        if (href && !vcloudHrefs.includes(href)) {
                            vcloudHrefs.push(href);
                            vcloudElements.push(el);
                        }
                    });

                    if (vcloudHrefs.length > 0) {
                        chosenQuality = res;
                        vcloudHrefs.forEach((href, idx) => {
                            const el = vcloudElements[idx];
                            let epNum = null;
                            let epLabel = null;
                            if (el) {
                                const parentText = $(el).parent().text().trim();
                                const prevText = $(el).parent().prev().text().trim();
                                const combinedContext = `${parentText} ${prevText}`;
                                const epMatch = combinedContext.match(/(?:episode|ep|e)\s*[:\-–—]?\s*(\d+)/i);
                                if (epMatch) {
                                    epNum = parseInt(epMatch[1], 10);
                                    epLabel = `Episode ${epNum}`;
                                }
                            }
                            if (!epNum) epNum = idx + 1;
                            if (!epLabel) epLabel = `Episode ${epNum}`;

                            episodes.push({
                                epNum,
                                label: epLabel,
                                href,
                                postTitle: epBtn._postTitle || post.title
                            });
                        });
                        break; // Stop checking buttons for this resolution once single episodes are extracted
                    }
                } catch (eErr) {
                    console.warn(`[AISearch] Failed extracting ${res} single episode list from ${epBtn.href}:`, eErr.message);
                }
            }
        }
        if (episodes.length > 0) break; // Stop at first successful resolution in priority fallback chain
    }

    return {
        batchZips,
        episodes,
        targetSeason,
        targetRes: chosenQuality || targetRes,
        postTitle: post.title
    };
}

/**
 * Main AI Search & Downloader Handler
 */
async function handleAiSearchCommand(sock, msg, args, userTextInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    // 0. CLEAR PRIOR SEARCH SESSIONS for this chat/sender before starting a new search
    const now = Date.now();
    for (const [key, session] of pendingPreConfirmations.entries()) {
        if (session.chatId === chatId || session.sender === sender || (now - (session.timestamp || 0) > 300000)) {
            pendingPreConfirmations.delete(key);
        }
    }
    for (const [key, session] of pendingPostSelections.entries()) {
        if (session.chatId === chatId || session.sender === sender || (now - (session.timestamp || 0) > 300000)) {
            pendingPostSelections.delete(key);
        }
    }

    let userPrompt = userTextInput || (Array.isArray(args) ? args.join(' ').trim() : args || '');

    // 1. If Voice Note, translate speech to English silently
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

    // 2. Extract Intent using AI
    let intent;
    try {
        intent = await extractSearchIntent(userPrompt);
        console.log(`[AISearch] Extracted Intent:`, intent);
    } catch (e) {
        intent = { query: userPrompt, year: null, resolution: '720p', type: 'movie', origin: 'non-indian' };
    }

    intent.userPrompt = userPrompt;
    intent.resolutionExplicit = /\b(480p|720p|1080p|2160p|4k)\b/i.test(userPrompt);

    if (!intent.query || intent.query.trim() === '') {
        intent.query = userPrompt;
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

    if (!intent.resolution) intent.resolution = '720p';

    // 3. Search target sites
    let candidates = await searchMoviesAndSeries(intent.query, intent.origin);

    if ((!candidates || candidates.length === 0) && intent.query !== userPrompt) {
        console.log(`[AISearch] 🔄 0 hits for "${intent.query}". Retrying site search with raw keyword: "${userPrompt}"`);
        candidates = await searchMoviesAndSeries(userPrompt, intent.origin);
    }

    if (!candidates || candidates.length === 0) {
        return sock.sendMessage(chatId, { text: `❌ No download posts found for "*${intent.query}*".` }, { quoted: msg });
    }

    let chosenPost = candidates[0];
    if (candidates.length > 1) {
        chosenPost = await selectBestMatch({ title: intent.query, year: intent.year }, candidates, intent.resolution);
    }

    // AUTO-DETECT SERIES TYPE FROM CANDIDATE POST TITLE
    const postTitleLower = (chosenPost.title || '').toLowerCase();
    if (/season\s*\d+|\bs\d+\b|seasons|complete\s*series/i.test(postTitleLower)) {
        console.log(`[AISearch] 🎯 Candidate post title "${chosenPost.title}" indicates TV Series. Setting intent.type = 'series'.`);
        intent.type = 'series';
    }

    // 3b. Detect available seasons
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
        intent.season = availableSeasons[0];
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
                           `1️⃣ *Quote/Reply* with *yes* or *1* to confirm.\n` +
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
 * Pre-Confirmation Gate Response Handler
 */
async function handlePreConfirmationReply(sock, msg, confirmKey, isApproved, updatedInput = null, isVoice = false, audioBuffer = null) {
    const chatId = msg.key.remoteJid;
    const session = pendingPreConfirmations.get(confirmKey);

    if (!session) {
        return sock.sendMessage(chatId, { text: '⚠️ Confirmation session expired or not found.' }, { quoted: msg });
    }

    // 1. Handle Voice Note input inside session step
    if (isVoice && audioBuffer) {
        try {
            updatedInput = await translateAudio(audioBuffer, 'audio/ogg');
            console.log(`[AISearch] User Quoted Voice Note Translated: "${updatedInput}"`);
        } catch (vErr) {
            return sock.sendMessage(chatId, { text: `❌ Voice processing failed: ${vErr.message}` }, { quoted: msg });
        }
    }

    // 2. Handle Step: 'select_episode_or_batch' (Options menu reply)
    if (session.step === 'select_episode_or_batch') {
        const { catalog, optionsMap } = session;
        const userInput = (updatedInput || '').trim();
        const lowerInput = userInput.toLowerCase();
        const { downloadCommandHandler } = require('./danie_download');
        const replyFn = async (t) => {
            if (typeof t === 'string' && t.trim()) {
                try {
                    await sock.sendMessage(chatId, { text: t }, { quoted: msg });
                } catch (_) {}
            }
        };

        pendingPreConfirmations.delete(confirmKey);

        // Parse chosen option numbers from user text or voice (e.g. "1", "2", "17", "1, 2")
        let chosenNumbers = [];
        const numMatches = userInput.match(/\b\d+\b/g);
        if (numMatches) {
            chosenNumbers = numMatches.map(n => parseInt(n, 10));
        }

        // Check if user requested a Batch Zip option by option number or keyword
        let selectedBatchObj = null;

        // A. Match by option number pointing to a batch item
        if (optionsMap) {
            chosenNumbers.forEach(num => {
                const item = optionsMap.get(num);
                if (item && item.type === 'batch' && !selectedBatchObj) {
                    selectedBatchObj = item.data;
                }
            });
        }

        // B. Match by keyword (e.g. "batch", "all episodes", "full season", "720p batch")
        if (!selectedBatchObj && (lowerInput.includes('batch') || lowerInput.includes('all episode') || lowerInput.includes('full season'))) {
            const matchedResBatch = catalog.batchZips.find(b => lowerInput.includes(b.resolution)) || catalog.batchZips.find(b => b.resolution === catalog.targetRes) || catalog.batchZips[0];
            selectedBatchObj = matchedResBatch;
        }

        if (selectedBatchObj) {
            console.log(`[AISearch] User selected Batch Zip: ${selectedBatchObj.title} (${selectedBatchObj.href})`);
            try {
                const isDirectHost = selectedBatchObj.href.includes('vcloud') || selectedBatchObj.href.includes('hubcloud') || selectedBatchObj.href.includes('fastdl') || selectedBatchObj.href.includes('filebee');
                const landing = isDirectHost ? selectedBatchObj.href : await resolveLandingLink(selectedBatchObj.href);
                const mediaUrl = await resolveVcloudLink(landing);
                if (mediaUrl) {
                    console.log(`[AISearch] Triggering .d command with Batch Zip VCloud link: ${mediaUrl}`);
                    return await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, mediaUrl, replyFn);
                } else {
                    throw new Error('VCloud resolution returned empty direct link');
                }
            } catch (bErr) {
                console.warn(`[AISearch] Batch Zip resolution/download failed: ${bErr.message}. Initiating sequential episode fallback...`);
                await replyFn(`⚠️ *Batch Zip download failed/unavailable.* Automatically downloading all ${catalog.episodes.length} episodes sequentially via VCloud...`);
            }

            // Fallback: Sequential episode download if Batch Zip failed
            for (const ep of catalog.episodes) {
                try {
                    const isDirectHost = ep.href.includes('vcloud') || ep.href.includes('hubcloud') || ep.href.includes('fastdl') || ep.href.includes('filebee');
                    const landing = isDirectHost ? ep.href : await resolveLandingLink(ep.href);
                    const mediaUrl = await resolveVcloudLink(landing);
                    if (mediaUrl) {
                        console.log(`[AISearch] Fallback sequential download for ${ep.label}: ${mediaUrl}`);
                        await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, mediaUrl, replyFn);
                    }
                } catch (epErr) {
                    console.warn(`[AISearch] Fallback download failed for ${ep.label}: ${epErr.message}`);
                }
            }
            return;
        }

        // Check if specific episode(s) selected by option number or text (e.g. "Episode 5", "5", "option 2")
        const selectedEpisodes = [];

        // A. Check by option map numbers
        if (optionsMap) {
            chosenNumbers.forEach(num => {
                const item = optionsMap.get(num);
                if (item && item.type === 'episode') {
                    selectedEpisodes.push(item);
                }
            });
        }

        // B. Check by episode regex text (e.g. "Episode 5" or "Ep 5")
        if (selectedEpisodes.length === 0) {
            const epMatch = userInput.match(/episode\s*(\d+)|ep\s*(\d+)/gi);
            if (epMatch) {
                epMatch.forEach(m => {
                    const num = parseInt(m.replace(/\D/g, ''), 10);
                    const foundEp = catalog.episodes.find(e => e.epNum === num);
                    if (foundEp && !selectedEpisodes.some(se => se.epNum === num)) {
                        selectedEpisodes.push(foundEp);
                    }
                });
            }
        }

        if (selectedEpisodes.length > 0) {
            console.log(`[AISearch] User selected ${selectedEpisodes.length} episode(s):`, selectedEpisodes.map(e => e.label));
            const firstBatchIdx = (catalog.episodes?.length || 0) + 1;

            for (const ep of selectedEpisodes) {
                try {
                    const isDirectHost = ep.href.includes('vcloud') || ep.href.includes('hubcloud') || ep.href.includes('fastdl') || ep.href.includes('filebee');
                    const landing = isDirectHost ? ep.href : await resolveLandingLink(ep.href);
                    const mediaUrl = await resolveVcloudLink(landing);
                    if (mediaUrl) {
                        console.log(`[AISearch] Triggering .d command for ${ep.label}: ${mediaUrl}`);
                        await downloadCommandHandler(sock, msg, chatId, msg.key.participant || chatId, mediaUrl, replyFn);
                    } else {
                        throw new Error('VCloud resolution returned empty direct link');
                    }
                } catch (epErr) {
                    console.warn(`[AISearch] Download failed for ${ep.label}: ${epErr.message}`);
                    await replyFn(`❌ *Error downloading ${ep.label}:* ${epErr.message}\n\n⚠️ *This specific episode link is giving an error or unavailable.*\n\n👉 *Reply with ${firstBatchIdx}* (or speak/type *"All Episodes"* / *"Batch Zip"*) to download the full Season Batch Zip instead!`);
                }
            }
            return;
        }

        // If selection couldn't be understood as an option number/episode/batch,
        // and user provided a new title/query in text or voice note, re-trigger AI search!
        if ((updatedInput && /[a-zA-Z]{2,}/.test(updatedInput)) || (isVoice && audioBuffer)) {
            console.log(`[AISearch] Re-triggering search with user query/title correction: "${updatedInput || 'Voice Note'}"`);
            return handleAiSearchCommand(sock, msg, [], updatedInput, isVoice, audioBuffer);
        }

        const firstBatchIdx = (catalog.episodes?.length || 0) + 1;
        return sock.sendMessage(chatId, { 
            text: `⚠️ *Selection not recognized.* Please quote/reply with the option number (e.g. *1* for Episode 1, or *${firstBatchIdx}* for All Episodes 720P), or specify clearly in text or voice note.` 
        }, { quoted: msg });
    }

    // Check if user changed season (e.g. "season 2" or "2")
    if (isApproved === null && updatedInput && session.intent.type === 'series') {
        const seasonNumMatch = updatedInput.match(/\bseason\s*(\d+)\b/i) || updatedInput.match(/^\s*(\d+)\s*$/);
        if (seasonNumMatch) {
            const requestedSeason = parseInt(seasonNumMatch[1], 10);
            session.intent.season = requestedSeason;
            console.log(`[AISearch] User changed TV Series target to Season ${requestedSeason}`);
            isApproved = true;
        }
    }

    // Title/keyword correction re-trigger
    if (isApproved === null && (updatedInput || (isVoice && audioBuffer))) {
        pendingPreConfirmations.delete(confirmKey);
        return handleAiSearchCommand(sock, msg, [], updatedInput, isVoice, audioBuffer);
    }

    if (!isApproved) {
        pendingPreConfirmations.delete(confirmKey);
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

    // If initial pre-confirmation approved and it's a TV Series without explicit episode:
    if (intent.type === 'series' && !intent.episode) {
        console.log(`[AISearch] Building interactive options menu for ${post.title} (Season ${intent.season || 1})...`);
        const catalog = await buildVcloudCatalog(post, intent, candidates);
        
        let optionIdx = 1;
        const optionsList = [];
        const optionsMap = new Map();

        // 1. LIST INDIVIDUAL EPISODES FIRST (1. Episode 1, 2. Episode 2...)
        if (catalog.episodes && catalog.episodes.length > 0) {
            catalog.episodes.forEach(ep => {
                optionsList.push(`${optionIdx}. ${ep.label}`);
                optionsMap.set(optionIdx, { type: 'episode', ...ep });
                optionIdx++;
            });
        }

        // 2. LIST ALL AVAILABLE BATCH ZIP OPTIONS AT THE VERY END (N+1. All Episodes 480P, N+2. 720P, N+3. 1080P)
        if (catalog.batchZips && catalog.batchZips.length > 0) {
            catalog.batchZips.forEach(bz => {
                optionsList.push(`${optionIdx}. ${bz.title}`);
                optionsMap.set(optionIdx, { type: 'batch', data: bz });
                optionIdx++;
            });
        }

        const firstBatchIdx = (catalog.episodes?.length || 0) + 1;
        const optionsText = `📦 *Select Download Option for Season ${catalog.targetSeason}*\n\n` +
                            `${optionsList.join('\n')}\n\n` +
                            `💬 *How to choose:*\n` +
                            `• *Quote/Reply* with option number(s) (e.g. *1* for Episode 1, *${firstBatchIdx}* for All Episodes 480P, *1, 2* for Episodes 1 & 2)\n` +
                            `• *Quote/Reply* with episode name or quality (e.g. *Episode 5* or *All Episodes 720P*)\n` +
                            `• Or send a voice note saying your choice!`;

        const sentMsg = await sock.sendMessage(chatId, { text: optionsText }, { quoted: msg });

        if (sentMsg && sentMsg.key && sentMsg.key.id) {
            pendingPreConfirmations.set(confirmKey, {
                chatId,
                sender: msg.key.participant || chatId,
                post,
                intent,
                candidates,
                catalog,
                optionsMap,
                step: 'select_episode_or_batch',
                messageId: sentMsg.key.id,
                timestamp: Date.now()
            });
        }
        return;
    }

    // Movie or series with explicit episode specified in initial prompt
    let mediaUrl = post.link;
    let postTitle = post.title;
    try {
        if (intent.type === 'series') {
            console.log(`[AISearch] Resolving TV Series media URL for Season ${intent.season || 1}${intent.episode ? ` Episode ${intent.episode}` : ''}...`);
            const catalog = await buildVcloudCatalog(post, intent, candidates);
            let chosenEp = null;
            if (intent.episode && catalog.episodes && catalog.episodes.length > 0) {
                chosenEp = catalog.episodes.find(e => e.epNum === intent.episode) || catalog.episodes[intent.episode - 1];
            } else if (catalog.episodes && catalog.episodes.length > 0) {
                chosenEp = catalog.episodes[0];
            }

            if (chosenEp && chosenEp.href) {
                const isDirectHost = chosenEp.href.includes('vcloud') || chosenEp.href.includes('hubcloud') || chosenEp.href.includes('fastdl') || chosenEp.href.includes('filebee');
                const landing = isDirectHost ? chosenEp.href : await resolveLandingLink(chosenEp.href);
                mediaUrl = await resolveVcloudLink(landing);
                postTitle = `${post.title} (${chosenEp.label})`;
            } else if (catalog.batchZips && catalog.batchZips.length > 0) {
                const bz = catalog.batchZips.find(b => b.resolution === catalog.targetRes) || catalog.batchZips[0];
                const isDirectHost = bz.href.includes('vcloud') || bz.href.includes('hubcloud') || bz.href.includes('fastdl') || bz.href.includes('filebee');
                const landing = isDirectHost ? bz.href : await resolveLandingLink(bz.href);
                mediaUrl = await resolveVcloudLink(landing);
                postTitle = `${post.title} (${bz.title})`;
            }
        } else {
            const allLinks = await scrapeAllPostLinks(post.link);
            const targetRes = (intent.resolution || '720p').toLowerCase();
            const matchedResLink = allLinks.find(l => l.resolution && l.resolution.toLowerCase() === targetRes) || allLinks[0];
            if (matchedResLink && matchedResLink.href) {
                const isDirectHost = matchedResLink.href.includes('vcloud') || matchedResLink.href.includes('hubcloud') || matchedResLink.href.includes('fastdl') || matchedResLink.href.includes('filebee');
                const landing = isDirectHost ? matchedResLink.href : await resolveLandingLink(matchedResLink.href);
                mediaUrl = await resolveVcloudLink(landing);
            }
        }
    } catch (scrapeErr) {
        console.warn('[AISearch] Link extraction fallback to post URL:', scrapeErr.message);
    }

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
