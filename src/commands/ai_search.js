const { translateAudio, extractSearchIntent, selectBestMatch } = require('../Utils/ai_provider');
const { searchMoviesAndSeries, scrapePostPage, scrapeAllPostLinks, resolveLandingLink, resolveVcloudLink, extractSubOptions, fetchHtmlWithRetry } = require('../Utils/movie_scraper');
const cheerio = require('cheerio');

// Lazy-loaded references (resolved on first use to avoid circular dependency)
let _danieMods = null;
function getDanieMods() {
    if (!_danieMods) {
        _danieMods = require('./danie_download');
    }
    return _danieMods;
}

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

function extractLanguages(title) {
    const lower = (title || '').toLowerCase();
    const langs = [];
    if (lower.includes('hindi')) langs.push('Hindi');
    if (lower.includes('english')) langs.push('English');
    if (lower.includes('korean')) langs.push('Korean');
    if (lower.includes('japanese') || lower.includes('anime')) langs.push('Japanese');
    if (lower.includes('tamil')) langs.push('Tamil');
    if (lower.includes('telugu')) langs.push('Telugu');
    if (lower.includes('multi audio')) langs.push('Multi Audio');
    if (lower.includes('dual audio')) langs.push('Dual Audio');
    return langs.length > 0 ? Array.from(new Set(langs)).join(' - ') : 'Hindi - English (Dual Audio)';
}

function formatPreConfirmCard(chosenPost, intent, availableSeasons = []) {
    const cleanTitle = intent.query || chosenPost.title;
    const rawLangs = extractLanguages(chosenPost.title);
    const languages = rawLangs.replace(/\s*-\s*/g, ' • ');
    const resUpper = (intent.resolution || '720p').toUpperCase();
    const yearStr = intent.year ? ` (${intent.year})` : '';

    let seasonSection = '';
    let flowSummary = `${cleanTitle}`;

    if (intent.type === 'series') {
        const selSeason = intent.season || 1;
        const selSeasonLabel = `S${String(selSeason).padStart(2, '0')}`;
        
        if (availableSeasons && availableSeasons.length > 0) {
            const formattedSeasons = availableSeasons.map(s => `S${String(s).padStart(2, '0')}`).join(', ');
            seasonSection = `📅 *Total Seasons:* *${formattedSeasons}* 🎯\n\n` +
                            `*Selected Season:* *${selSeasonLabel}*\n\n`;
        } else {
            seasonSection = `🎯 *Selected Season:* *${selSeasonLabel}*\n\n`;
        }

        flowSummary = `${cleanTitle} ➔ Season ${selSeason} ➔ ${resUpper}`;
    } else {
        flowSummary = `${cleanTitle} ➔ ${resUpper}`;
    }

    return `🎬 *${cleanTitle}${yearStr}*\n\n` +
           `─────────────────────────────\n\n` +
           `🌐 *Languages:* *${languages}*\n` +
           `📺 *Quality:* *${resUpper}*\n` +
           `${seasonSection}` +
           `─────────────────────────────\n\n` +
           `🔄 *Confirm:* *${flowSummary}*`;
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

    // 1. If Voice Note, send immediate short acknowledgement and translate speech
    if (isVoice && audioBuffer) {
        try {
            await sock.sendMessage(chatId, { text: '⏳ *Processing, please wait . . .*' }, { quoted: msg });
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
            intent.tmdbId = tmdbInfo.tmdbId;
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
    const preConfirmText = formatPreConfirmCard(chosenPost, intent, availableSeasons);

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
 * Helper to build and send interactive episode selection menu for series
 */
async function sendInteractiveEpisodeMenu(sock, msg, chatId, confirmKey, session) {
    const { post, intent, candidates } = session;
    const resUpper = (intent.resolution || '720p').toUpperCase();
    console.log(`[AISearch] Building interactive options menu for ${post.title} (Season ${intent.season || 1}, ${resUpper})...`);
    
    const catalog = await buildVcloudCatalog(post, intent, candidates);
    
    let optionIdx = 1;
    const optionsList = [];
    const optionsMap = new Map();

    const resLabel = (catalog.targetRes || '720p').toUpperCase();

    // 1. LIST INDIVIDUAL EPISODES with resolution
    if (catalog.episodes && catalog.episodes.length > 0) {
        catalog.episodes.forEach(ep => {
            optionsList.push(`${optionIdx}. ${ep.label}  ─  _${resLabel}_`);
            optionsMap.set(optionIdx, { type: 'episode', ...ep });
            optionIdx++;
        });
    }

    // 2. LIST ALL AVAILABLE BATCH ZIP OPTIONS AT THE VERY END
    if (catalog.batchZips && catalog.batchZips.length > 0) {
        catalog.batchZips.forEach(bz => {
            optionsList.push(`${optionIdx}. 📦 ${bz.title}`);
            optionsMap.set(optionIdx, { type: 'batch', data: bz });
            optionIdx++;
        });
    }

    if (optionsList.length === 0) {
        return sock.sendMessage(chatId, { 
            text: `❌ *No download options found for Season ${catalog.targetSeason || intent.season || 1} (${resLabel}).* Please try another season or resolution.` 
        }, { quoted: msg });
    }

    const firstBatchIdx = (catalog.episodes?.length || 0) + 1;
    const optionsText = `📦 *Select Download Option for Season ${catalog.targetSeason}*\n\n` +
                        `${optionsList.join('\n')}\n\n` +
                        `💬 *How to choose:*\n` +
                        `• *Quote/Reply* with option number(s) (e.g. *1* for Episode 1, *${firstBatchIdx}* for ${catalog.batchZips?.[0]?.title || 'All Episodes'}, *1, 2* for Episodes 1 & 2)\n` +
                        `• *Quote/Reply* with episode name or quality (e.g. *Episode 5* or *All Episodes 720P*)\n` +
                        `• Or send a voice note saying your choice!`;

    const sentMsg = await sock.sendMessage(chatId, { text: optionsText }, { quoted: msg });

    if (sentMsg && sentMsg.key && sentMsg.key.id) {
        pendingPreConfirmations.set(confirmKey, {
            ...session,
            catalog,
            optionsMap,
            step: 'select_episode_or_batch',
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
        const { downloadCommandHandler } = getDanieMods();
        const replyFn = async (t) => {
            if (typeof t === 'string' && t.trim()) {
                try {
                    await sock.sendMessage(chatId, { text: t }, { quoted: msg });
                } catch (_) {}
            }
        };

        // Check if user requested a Season or Quality/Resolution change while on the episode menu
        const seasonMatch = lowerInput.match(/\bseason\s*(\d+)\b/i) || 
                            lowerInput.match(/\bs(\d+)\b/i) || 
                            lowerInput.match(/\b(\d+)(?:st|nd|rd|th)\s*season\b/i);
        const resMatch = lowerInput.match(/\b(480p?|720p?|1080p?|2160p?|4k)\b/i);

        const newSeason = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3], 10) : null;
        let newRes = null;
        if (resMatch) {
            const rawRes = resMatch[1].toLowerCase();
            newRes = (rawRes.endsWith('p') || rawRes === '4k') ? rawRes : `${rawRes}p`;
        }

        // If Season or Quality is specified in the user reply, switch season/quality and re-send the episode selection menu
        // (Do NOT start downloading)
        if (newSeason || newRes) {
            console.log(`[AISearch] User requested season/quality change on options menu. New Season: ${newSeason}, New Res: ${newRes}`);
            pendingPreConfirmations.delete(confirmKey);

            if (newSeason && newSeason >= 1 && newSeason <= 50) {
                session.intent.season = newSeason;
            }
            if (newRes) {
                session.intent.resolution = newRes;
                session.intent.resolutionExplicit = true;
            }

            await replyFn(`🔄 *Updating download options for Season ${session.intent.season || 1} (${(session.intent.resolution || '720p').toUpperCase()})...*`);
            return sendInteractiveEpisodeMenu(sock, msg, chatId, confirmKey, session);
        }

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
                    console.log(`[AISearch] Triggering .p command with Batch Zip VCloud link: ${mediaUrl}`);
                    return await triggerPCommandHandlerFromAiSearch(sock, msg, chatId, msg.key.participant || chatId, catalog.intent || intent, mediaUrl, selectedBatchObj.title);
                } else {
                    throw new Error('VCloud resolution returned empty direct link');
                }
            } catch (bErr) {
                console.warn(`[AISearch] Batch Zip resolution/download failed: ${bErr.message}. Initiating sequential episode fallback...`);
                await replyFn(`⚠️ *Batch Zip download failed/unavailable.* Automatically downloading all ${catalog.episodes.length} episodes sequentially via VCloud...`);
            }

            // Fallback: Parallel episode download if Batch Zip failed
            const fallbackResolveResults = await Promise.all(catalog.episodes.map(async (ep) => {
                try {
                    const isDirectHost = ep.href.includes('vcloud') || ep.href.includes('hubcloud') || ep.href.includes('fastdl') || ep.href.includes('filebee');
                    const landing = isDirectHost ? ep.href : await resolveLandingLink(ep.href);
                    return await resolveVcloudLink(landing);
                } catch (epErr) {
                    console.warn(`[AISearch] Fallback download failed for ${ep.label}: ${epErr.message}`);
                    return null;
                }
            }));

            const resolvedFallbackUrls = fallbackResolveResults.filter(Boolean);
            if (resolvedFallbackUrls.length > 0) {
                await triggerPCommandHandlerFromAiSearch(
                    sock, msg, chatId, msg.key.participant || chatId, 
                    catalog.intent || intent, resolvedFallbackUrls.join(', '), `Season ${catalog.targetSeason} (${catalog.episodes.length} Episodes)`, true
                );
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



            console.log(`[AISearch] Parallel resolving direct download links for ${selectedEpisodes.length} episode(s)...`);
            
            const resolveResults = await Promise.all(selectedEpisodes.map(async (ep) => {
                try {
                    const isDirectHost = ep.href.includes('vcloud') || ep.href.includes('hubcloud') || ep.href.includes('fastdl') || ep.href.includes('filebee');
                    const landing = isDirectHost ? ep.href : await resolveLandingLink(ep.href);
                    const mediaUrl = await resolveVcloudLink(landing);
                    if (mediaUrl) {
                        return { ok: true, ep, mediaUrl };
                    }
                } catch (epErr) {
                    console.warn(`[AISearch] Download resolution failed for ${ep.label}: ${epErr.message}`);
                }
                return { ok: false, ep };
            }));

            const resolvedMediaUrls = [];
            const failedEpisodes = [];

            for (const res of resolveResults) {
                if (res.ok && res.mediaUrl) {
                    resolvedMediaUrls.push(res.mediaUrl);
                } else {
                    failedEpisodes.push(res.ep.label);
                }
            }

            if (resolvedMediaUrls.length > 0) {
                const combinedMediaQuery = resolvedMediaUrls.join(', ');
                const labelSummary = selectedEpisodes.length === 1 
                    ? selectedEpisodes[0].label 
                    : `${selectedEpisodes.length} Episodes (${selectedEpisodes.map(e => e.epNum ? `E${e.epNum}` : e.label).join(', ')})`;
                
                await triggerPCommandHandlerFromAiSearch(
                    sock, msg, chatId, msg.key.participant || chatId, 
                    session.intent || intent, combinedMediaQuery, labelSummary, true
                );
            }

            if (failedEpisodes.length > 0) {
                await replyFn(`⚠️ *Could not resolve direct links for:* ${failedEpisodes.join(', ')}\n\n👉 *Reply with ${firstBatchIdx}* to download the full Season Batch Zip instead!`);
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

    // Check if user specified custom changes (season, resolution, or episode list e.g. "3, 4, 5, 6", "4,5,6,7", "season 2", "1080p")
    if (isApproved === null && (updatedInput || (isVoice && audioBuffer))) {
        const textToAnalyze = (updatedInput || '').trim();
        const lowerText = textToAnalyze.toLowerCase();

        // 1. Check explicit confirmation / cancellation keywords & voice phrases (English & Hindi/Hinglish)
        const confirmKeywords = [
            'yes', 'y', '1', 'confirm', 'ok', 'okay', 'download', 'proceed', 'go',
            'haan', 'ha', 'haji', 'ji haan', 'haan ji', 'yahi', 'sahi', 'sahi hai',
            'kar do', 'bhej do', 'bhejo', 'yep', 'yeah', 'yup', 'sure', 'correct', 'right', 'ok hai', 'ha yahi'
        ];

        const isAgreement = confirmKeywords.includes(lowerText) ||
                            /\b(yes|haan|ha|haji|ok|okay|yahi|sahi|kar do|bhej do|bhejo|sure|yep|yeah|yup|proceed|download)\b/i.test(lowerText);

        if (isAgreement) {
            isApproved = true;
        } else if (['no', 'n', 'cancel', '0', 'stop', 'mat karo', 'na', 'rahne do'].includes(lowerText)) {
            isApproved = false;
        } else {
            // 2. Use AI / Regex to parse custom updates from voice or text reply
            let replyIntent = null;
            try {
                replyIntent = await extractSearchIntent(textToAnalyze);
            } catch (_) {}

            // Check if title changed completely to a different movie/show
            const currentTitleLower = (session.intent.query || '').toLowerCase();
            const newTitleLower = (replyIntent?.query || '').toLowerCase();
            const isDifferentTitle = replyIntent && replyIntent.query &&
                !currentTitleLower.includes(newTitleLower) &&
                !newTitleLower.includes(currentTitleLower) &&
                !/^(episode|ep|season|s\d+|480p|720p|1080p|4k|yes|no|confirm|download)\b/i.test(newTitleLower);

            if (isDifferentTitle) {
                console.log(`[AISearch] User specified new title in reply: "${replyIntent.query}". Re-triggering search...`);
                pendingPreConfirmations.delete(confirmKey);
                return handleAiSearchCommand(sock, msg, [], textToAnalyze, isVoice, audioBuffer);
            }

            let isCardModified = false;

            // Extract Season change
            const seasonNumMatch = lowerText.match(/\bseason\s*(\d+)\b/i) || lowerText.match(/\bs(\d+)\b/i) || (replyIntent?.season ? [null, replyIntent.season] : null);
            if (seasonNumMatch) {
                const newSeason = parseInt(seasonNumMatch[1], 10);
                if (newSeason >= 1 && newSeason <= 50) {
                    session.intent.season = newSeason;
                    console.log(`[AISearch] User updated season to Season ${newSeason}`);
                    isCardModified = true;
                }
            }

            // Extract Quality change
            const resMatch = lowerText.match(/\b(480p|720p|1080p|2160p|4k)\b/i) || (replyIntent?.resolutionExplicit ? [null, replyIntent.resolution] : null);
            if (resMatch) {
                session.intent.resolution = (resMatch[1] || resMatch).toLowerCase();
                session.intent.resolutionExplicit = true;
                console.log(`[AISearch] User updated resolution to ${session.intent.resolution}`);
                isCardModified = true;
            }

            // Extract Multi-Episode list (e.g. "3, 4, 5, 6", "4,5,6,7", "3 4 5 6", "episodes 3 to 6")
            const epNums = [];
            const rangeMatch = lowerText.match(/\b(?:episodes?|ep)?\s*(\d+)\s*(?:to|-|–)\s*(\d+)\b/i);
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1], 10);
                const end = parseInt(rangeMatch[2], 10);
                if (start < end && end - start <= 30) {
                    for (let i = start; i <= end; i++) {
                        if (i !== session.intent.season) epNums.push(i);
                    }
                }
            }

            if (epNums.length === 0) {
                const numMatches = lowerText.match(/\b\d+\b/g);
                if (numMatches && numMatches.length > 0) {
                    numMatches.forEach(n => {
                        const num = parseInt(n, 10);
                        if (num >= 1 && num <= 100 && num !== session.intent.season && num !== 480 && num !== 720 && num !== 1080 && !epNums.includes(num)) {
                            epNums.push(num);
                        }
                    });
                }
            }

            if (epNums.length > 0) {
                session.intent.selectedEpisodes = epNums;
                session.intent.episode = epNums[0];
                console.log(`[AISearch] User specified target episodes: ${epNums.join(', ')}`);
                isCardModified = true;
            }

            // IF CARD DETAILS WERE MODIFIED, UPDATE & RE-SEND THE CONFIRMATION CARD INSTEAD OF PROCEEDING TO DOWNLOAD!
            if (isCardModified) {
                console.log(`[AISearch] Card details updated by user reply. Updating confirmation box message...`);
                const updatedCardText = formatPreConfirmCard(session.post, session.intent, session.availableSeasons);
                const sentMsg = session.post.thumbnail
                    ? await sock.sendMessage(chatId, { image: { url: session.post.thumbnail }, caption: updatedCardText }, { quoted: msg })
                    : await sock.sendMessage(chatId, { text: updatedCardText }, { quoted: msg });

                if (sentMsg && sentMsg.key && sentMsg.key.id) {
                    session.messageId = sentMsg.key.id;
                    session.timestamp = Date.now();
                }
                return;
            }
        }
    }

    if (!isApproved) {
        pendingPreConfirmations.delete(confirmKey);
        return sock.sendMessage(chatId, { text: '❌ *Search request cancelled.*' }, { quoted: msg });
    }

    const { post, intent, candidates } = session;
    const { pCommandHandler, downloadCommandHandler } = getDanieMods();
    const replyFn = async (t) => {
        if (typeof t === 'string' && t.trim()) {
            try {
                await sock.sendMessage(chatId, { text: t }, { quoted: msg });
            } catch (_) {}
        }
    };

    // ══════════════════════════════════════════════════════════════════
    // SERIES: ALWAYS show the interactive episode selection menu.
    // Never auto-download — even if user specified episode numbers in
    // their search query. Let them confirm which episodes to download
    // after seeing the full list with resolution info.
    // ══════════════════════════════════════════════════════════════════
    if (intent.type === 'series') {
        return sendInteractiveEpisodeMenu(sock, msg, chatId, confirmKey, session);
    }

    // ══════════════════════════════════════════════════════════════════
    // MOVIE: Resolve download link and trigger .p + .d
    // ══════════════════════════════════════════════════════════════════
    let mediaUrl = post.link;
    let postTitle = post.title;
    try {
        const allLinks = await scrapeAllPostLinks(post.link);
        const targetRes = (intent.resolution || '720p').toLowerCase();
        const matchedResLink = allLinks.find(l => l.resolution && l.resolution.toLowerCase() === targetRes) || allLinks[0];
        if (matchedResLink && matchedResLink.href) {
            const isDirectHost = matchedResLink.href.includes('vcloud') || matchedResLink.href.includes('hubcloud') || matchedResLink.href.includes('fastdl') || matchedResLink.href.includes('filebee');
            const landing = isDirectHost ? matchedResLink.href : await resolveLandingLink(matchedResLink.href);
            mediaUrl = await resolveVcloudLink(landing);
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
        console.log(`[AISearch] Triggering download handler with direct link: ${downloadQuery}`);
        await triggerPCommandHandlerFromAiSearch(sock, msg, chatId, msg.key.participant || chatId, intent, downloadQuery);
    }
}

async function triggerPCommandHandlerFromAiSearch(sock, msg, chatId, sender, intent, mediaUrl, epLabel = '', includePoster = true) {
    const { pCommandHandler, downloadCommandHandler, globalTaskQueue } = getDanieMods();
    const replyFn = async (t) => {
        if (typeof t === 'string' && t.trim()) {
            try { await sock.sendMessage(chatId, { text: t }, { quoted: msg }); } catch (_) {}
        }
    };

    // Build TMDB URL for poster/trailer
    let tmdbUrl = '';
    if (intent && intent.tmdbId) {
        const typeStr = intent.type === 'series' ? 'tv' : 'movie';
        tmdbUrl = `https://www.themoviedb.org/${typeStr}/${intent.tmdbId}`;
        if (intent.type === 'series' && intent.season) {
            tmdbUrl += `/season/${intent.season}`;
        }
    } else if (intent && intent.query) {
        tmdbUrl = intent.query;
    }

    const titleLabel = (intent && intent.query) || 'AI Search Download';
    const downloadLabel = epLabel ? `${titleLabel} (${epLabel})` : titleLabel;
    const dArgs = mediaUrl;

    if (tmdbUrl && includePoster) {
        // ── Task 1: Queue .p command with TMDB URL ONLY (poster + trailer) ──
        const pTask = {
            type: 'p_command',
            description: `🎬 Post: ${downloadLabel}`,
            commandText: `.p ${tmdbUrl}`,
            senderJid: sender,
            from: chatId,
            executeFn: async (signal, ref) => {
                await pCommandHandler(sock, msg, chatId, sender, tmdbUrl, replyFn, signal, ref);
            }
        };
        const queuedP = globalTaskQueue.add(pTask);
        if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedP.id) {
            await replyFn(`🎬 *Post Queued* (Position #${globalTaskQueue.queue.length}):\n📌 ${downloadLabel}`);
        }
    }

    // ── Task 2: Queue .d command with the direct download link ──
    const dTask = {
        type: 'd_command',
        description: `📥 Download: ${downloadLabel}`,
        commandText: `.d ${dArgs}`,
        senderJid: sender,
        from: chatId,
        executeFn: async (signal, ref) => {
            await downloadCommandHandler(sock, msg, chatId, sender, dArgs, replyFn, signal, ref);
        }
    };
    const queuedD = globalTaskQueue.add(dTask);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedD.id) {
        await replyFn(`📥 *Download Queued* (Position #${globalTaskQueue.queue.length}):\n📌 ${downloadLabel}`);
    }

    console.log(`[AISearch] Queued download for "${downloadLabel}" (includePoster: ${includePoster})`);
}

module.exports = {
    handleAiSearchCommand,
    handlePreConfirmationReply,
    formatPreConfirmCard,
    pendingPreConfirmations,
    pendingPostSelections
};
