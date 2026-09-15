require('dotenv').config({ path: './config.env' });
const axios = require('axios');
const FormData = require('form-data');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

/**
 * Transcribes and translates audio buffer strictly into English or Urdu text using Groq Whisper Large v3
 */
async function translateAudio(audioBuffer, mimeType = 'audio/mp3') {
    if (!GROQ_KEY) {
        throw new Error("GROQ_API_KEY is not configured in config.env");
    }

    try {
        const form = new FormData();
        const cleanMime = (mimeType || 'audio/mp3').split(';')[0].trim();
        const extension = cleanMime.includes('ogg') ? 'ogg' : cleanMime.includes('m4a') ? 'm4a' : 'mp3';
        form.append('file', audioBuffer, { filename: `audio.${extension}`, contentType: cleanMime });
        form.append('model', 'whisper-large-v3');
        form.append('prompt', 'Strictly transcribe audio ONLY into English or Urdu (Roman Urdu / Urdu text). Do NOT output in any other language. Transcribe movie titles, TV series, season numbers, episode numbers, and qualities accurately, e.g. Custody 2023, Stree 2, Pushpa 2, 720p, 1080p, Tamil, Hindi, English, Urdu');

        const response = await axios.post('https://api.groq.com/openai/v1/audio/translations', form, {
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                ...form.getHeaders()
            }
        });

        return response.data.text ? response.data.text.trim() : '';
    } catch (err) {
        console.error("❌ Audio translation error:", err.response?.data || err.message);
        // Fallback to transcription endpoint if translation endpoint fails
        return transcribeAudio(audioBuffer, mimeType);
    }
}

/**
 * Transcribes audio buffer strictly into English or Urdu using Groq Whisper Large v3
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/mp3') {
    if (!GROQ_KEY) {
        throw new Error("GROQ_API_KEY is not configured in config.env");
    }

    try {
        const form = new FormData();
        const cleanMime = (mimeType || 'audio/mp3').split(';')[0].trim();
        const extension = cleanMime.includes('ogg') ? 'ogg' : cleanMime.includes('m4a') ? 'm4a' : 'mp3';
        form.append('file', audioBuffer, { filename: `audio.${extension}`, contentType: cleanMime });
        form.append('model', 'whisper-large-v3-turbo');
        form.append('prompt', 'Strictly transcribe audio ONLY into English or Urdu (Roman Urdu / Urdu text). Do NOT output in any other language. Transcribe movie and TV show titles, season numbers, episodes, e.g. Custody 2023, Stree 2, Pushpa 2, Stranger Things, Season 2, Episode 5, 720p, 1080p');

        const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                ...form.getHeaders()
            }
        });

        return response.data.text ? response.data.text.trim() : '';
    } catch (err) {
        console.error("❌ Audio transcription error:", err.response?.data || err.message);
        throw err;
    }
}

/**
 * Parses user text or transcribed speech into structured movie/series search intent,
 * correcting mispronunciations, spoken accents, and phonetic errors (e.g. "streetoo" -> "Stree 2").
 */
async function extractSearchIntent(inputPrompt) {
    if (!GROQ_KEY) {
        throw new Error("GROQ_API_KEY is not configured in config.env");
    }

    const systemPrompt = `You are an expert movie and TV series title normalization assistant.
The user input may come from spoken voice notes or mispronounced/phonetically misspelled text in English, Hindi, Urdu, or regional languages (e.g. "streetoo" -> "Stree 2", "pushpa tu" -> "Pushpa 2", "avengers end game" -> "Avengers: Endgame", "spiderman no way home" -> "Spider-Man: No Way Home", "stranger thngs s2" -> "Stranger Things").

Analyze the input and output strict JSON with keys:
- "query": OFFICIAL CANONICAL TITLE of the movie or TV show (corrected for phonetic mispronunciations, Urdu/Hindi spoken accents, typos, and phonetic speech errors like "streetoo" -> "Stree 2").
- "year": 4-digit release year if mentioned or strongly associated (e.g. "2023"), else null
- "resolution": requested quality ("480p", "720p", "1080p", "4k"). DEFAULT to "720p" if unspecified.
- "type": "movie" or "series" (detect based on words like "season", "episode", "s01", "series", "tv", "part 2" vs "movie")
- "season": season number if mentioned as integer (e.g. 2 for "season 2"), else null
- "episode": episode number if mentioned as integer (e.g. 5 for "episode 5"), else null
- "origin": "indian" (if Bollywood, Hindi, Urdu, South Indian, Tamil, Telugu, Punjabi, Malayalam) OR "non-indian" (if Hollywood, English, Korean, Anime, Foreign)
- "language": specific language if mentioned (e.g. "tamil", "hindi", "telugu", "english"), else null
- "site": "vegamovies", "rogmovies", "hdhub4u", or "both" (default "both")
- "noPoster": boolean (true if user specifies not to send poster)
- "noCaption": boolean (true if user specifies not to send caption)
- "noTrailer": boolean (true if user specifies not to send trailer)
- "addToQueue": boolean (true if user asks to add to queue directly)

Respond ONLY with valid JSON, no markdown wrappers, no prose.`;

    const candidateModels = ['openai/gpt-oss-120b', 'groq/compound-mini'];

    for (const model of candidateModels) {
        try {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: inputPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const raw = response.data.choices[0].message.content;
            const parsed = JSON.parse(raw);
            if (!parsed.resolution || !['480p', '720p', '1080p', '4k'].includes(parsed.resolution.toLowerCase())) {
                parsed.resolution = '720p';
            }
            return parsed;
        } catch (err) {
            console.warn(`⚠️ Extract intent failed with model ${model}, trying next model... (${err.message})`);
        }
    }

    // Fallback simple parsing with phonetic map if all AI models fail
    let cleanText = inputPrompt;
    if (/streetoo|stree\s*two|stree2/i.test(cleanText)) cleanText = "Stree 2";
    if (/pushpa\s*two|pushpatwo/i.test(cleanText)) cleanText = "Pushpa 2";

    const isSeries = /season|episode|s\d+/i.test(cleanText);
    const resMatch = cleanText.match(/1080p|720p|480p|4k/i);
    const yearMatch = cleanText.match(/\b(19\d\d|20\d\d)\b/);
    const isIndian = /hindi|bollywood|punjabi|tamil|telugu|malayalam|stree|pushpa|jawan|pathaan|rrx|kgf|custody/i.test(cleanText);
    const langMatch = cleanText.match(/tamil|hindi|telugu|malayalam|punjabi|english|korean|japanese/i);
    return {
        query: cleanText.replace(/1080p|720p|480p|4k|movie|series|\b(19\d\d|20\d\d)\b/gi, '').trim(),
        year: yearMatch ? yearMatch[1] : null,
        resolution: resMatch ? resMatch[0].toLowerCase() : '720p',
        type: isSeries ? 'series' : 'movie',
        season: null,
        episode: null,
        origin: isIndian ? 'indian' : 'non-indian',
        language: langMatch ? langMatch[0].toLowerCase() : null,
        site: 'both',
        noPoster: /no\s*poster|dont\s*send\s*poster|without\s*poster/i.test(cleanText),
        noCaption: /no\s*caption|dont\s*send\s*caption|without\s*caption/i.test(cleanText),
        noTrailer: /no\s*trailer|dont\s*send\s*trailer|without\s*trailer/i.test(cleanText),
        addToQueue: /queue|add\s*to\s*queue/i.test(cleanText)
    };
}

/**
 * Universal Intent & Action Router for Full Personal AI Assistant control over the WhatsApp Bot
 */
async function understandUniversalIntent(inputPrompt, contextInfo = {}) {
    if (!GROQ_KEY) {
        throw new Error("GROQ_API_KEY is not configured in config.env");
    }

    const systemPrompt = `You are a Universal Personal AI Assistant controlling a WhatsApp Automation Bot.
Your job is to analyze the user's input (text or transcribed voice note) and determine the exact action to execute.

Available Actions & Fields:
1. "search_download": User wants to search & download/queue a movie or TV show.
   Fields:
   - "query": Canonical movie/series title (e.g. "Custody", "Stree 2", "Inception")
   - "year": 4-digit release year if mentioned (e.g. "2023"), else null
   - "resolution": requested quality ("480p", "720p", "1080p", "4k"). Default "720p".
   - "type": "movie" or "series"
   - "season": season integer if mentioned, else null
   - "episode": episode integer if mentioned, else null
   - "origin": "indian" or "non-indian"
   - "language": requested audio/sub language (e.g. "tamil", "hindi", "english"), else null
   - "site": "vegamovies", "rogmovies", "hdhub4u", or "both" (default "both")
   - "noPoster": boolean (true if user specifies not to send poster)
   - "noCaption": boolean (true if user specifies not to send caption)
   - "noTrailer": boolean (true if user specifies not to send trailer)
   - "addToQueue": boolean (true if user asks to add to queue directly)

2. "homepage_extract": User wants to view/extract latest posts from site homepage.
   Fields:
   - "site": "vegamovies", "rogmovies", "hdhub4u", or "both"
   - "category": category string if mentioned (e.g. "web-series", "1080p", "tamil"), else null

3. "post_extract_link": User is replying or asking to extract a specific post number/resolution from previous listing.
   Fields:
   - "postIndex": 1-based integer index of post mentioned (e.g. 3 for "post 3" or "3")
   - "resolution": requested quality ("480p", "720p", "1080p", "4k")
   - "episode": episode integer if mentioned, else null

4. "toggle_antilink": User wants to enable or disable Anti-Link protection on a group.
   Fields:
   - "enable": true to turn on, false to turn off
   - "targetGroupName": name of the group mentioned (e.g. "request daniewatch", "movie group")

5. "toggle_antispam": User wants to enable or disable Anti-Spam protection on a group.
   Fields:
   - "enable": true to turn on, false to turn off
   - "targetGroupName": name of the group mentioned

6. "queue_management": User wants to manage download queue.
   Fields:
   - "subAction": "show" (view queue), "clear" (clear queue), "remove" (remove item), "status"
   - "itemIndex": 1-based index if removing a specific item, else null

7. "daily_release_list": User wants to view or generate daily release catalog/history.
   Fields:
   - "subAction": "generate" (today list), "history" (last 7 days)

8. "domain_settings": User wants to view or update site domain or host priority.
   Fields:
   - "subAction": "view" or "update"
   - "site": "rogmovies", "vegamovies", or "host_priority"
   - "value": new URL or priority string if updating

9. "social_media_download": User wants to download YouTube, Instagram, TikTok, Facebook video or song.
   Fields:
   - "platform": "youtube", "instagram", "tiktok", "facebook"
   - "mediaType": "video" or "audio"
   - "url": URL if provided in text, else null

10. "system_status": User asks for bot status, health, or uptime.

11. "general_ai_assistant": For general questions, web search requests, news, math, actor info, plot explanations, or conversational chat.
   Fields:
   - "answerPrompt": clean search or response prompt to send to AI assistant

Output STRICT JSON with key "action" set to one of the above 11 action strings, along with its specific fields. No markdown wrappers.`;

    const candidateModels = ['openai/gpt-oss-120b', 'groq/compound-mini'];

    for (const model of candidateModels) {
        try {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: inputPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const parsed = JSON.parse(response.data.choices[0].message.content);
            return parsed;
        } catch (err) {
            console.warn(`⚠️ Universal intent classifier failed with model ${model}, trying next model... (${err.message})`);
        }
    }

    // Fallback classification logic
    const lower = inputPrompt.toLowerCase();
    if (lower.includes('homepage') || lower.includes('latest post')) {
        const site = lower.includes('rog') ? 'rogmovies' : 'vegamovies';
        return { action: 'homepage_extract', site };
    }
    if (lower.includes('antilink') || lower.includes('anti-link')) {
        const enable = !lower.includes('off') && !lower.includes('disable') && !lower.includes('remove');
        return { action: 'toggle_antilink', enable, targetGroupName: inputPrompt.replace(/turn on|turn off|enable|disable|antilink|anti-link|protection|group|in|on|the/gi, '').trim() };
    }
    if (lower.includes('antispam') || lower.includes('anti-spam')) {
        const enable = !lower.includes('off') && !lower.includes('disable') && !lower.includes('remove');
        return { action: 'toggle_antispam', enable, targetGroupName: inputPrompt.replace(/turn on|turn off|enable|disable|antispam|anti-spam|protection|group|in|on|the/gi, '').trim() };
    }

    // Fallback to extractSearchIntent
    const baseIntent = await extractSearchIntent(inputPrompt);
    return { action: 'search_download', ...baseIntent };
}

/**
 * Evaluates candidate posts scraped from Vegamovies/Rogmovies against TMDB info & target year/language using AI
 */
async function selectBestMatch(tmdbInfo, candidates, targetResolution = '720p', targetYear = null, targetLanguage = null) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    if (!GROQ_KEY) return candidates[0];

    const prompt = `User search request:
Title: ${tmdbInfo?.title || 'Unknown'}
Release Year: ${targetYear || tmdbInfo?.year || 'Unknown'}
Target Language/Audio: ${targetLanguage || 'Any (Prefer Tamil/Hindi Dual/Multi Audio)'}
Target Quality: ${targetResolution}

Scraped Candidate Posts:
${candidates.map((c, i) => `[Index ${i}] Title: "${c.title}" | Site: ${c.site} | URL: ${c.link}`).join('\n')}

Select the SINGLE best candidate post index that matches the title, release year (${targetYear || tmdbInfo?.year || 'Any'}), requested language (${targetLanguage || 'Tamil/Hindi'}), and quality (${targetResolution}).
IMPORTANT PREFERENCE:
- If year (${targetYear || tmdbInfo?.year}) is provided, strongly prefer candidate posts that include that exact year in the post title.
- If language (e.g. Tamil, Hindi) is requested, strongly prefer candidate posts matching that language.
- Prefer Dual Audio / Multi Audio / ORG Audio posts over non-Hindi/non-regional posts.
Respond ONLY with JSON: {"bestIndex": <number>, "reason": "<short explanation>"}`;

    const candidateModels = ['openai/gpt-oss-120b', 'groq/compound-mini'];

    for (const model of candidateModels) {
        try {
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const resJson = JSON.parse(response.data.choices[0].message.content);
            const index = resJson.bestIndex;
            if (typeof index === 'number' && candidates[index]) {
                return candidates[index];
            }
            return candidates[0];
        } catch (err) {
            console.warn(`⚠️ Select best match AI failed with model ${model}, trying next...`);
        }
    }
    return candidates[0];
}

/**
 * Performs hybrid verification when user provides text alongside a poster image.
 * Cross-references user-provided title text with poster metadata and TMDB database.
 */
async function verifyPosterWithUserTitle(userText, posterInfo = null) {
    let intent = await extractSearchIntent(userText || '');
    if (posterInfo && posterInfo.query) {
        const textTitle = (intent.query || userText || '').toLowerCase().trim().replace(/[^a-z]/g, '');
        const posterTitle = (posterInfo.query || '').toLowerCase().trim().replace(/[^a-z]/g, '');

        const isExactMatch = textTitle === posterTitle;
        const isSubstring = textTitle.includes(posterTitle) || posterTitle.includes(textTitle);

        // Check if first 3-4 letters match (e.g. "hasindilruba" vs "haseendillruba")
        const sharePrefix = textTitle.length >= 3 && posterTitle.length >= 3 && textTitle.slice(0, 3) === posterTitle.slice(0, 3);

        if (isExactMatch || isSubstring || sharePrefix) {
            console.log(`[AIVerifier] ✅ Poster metadata verified against user title: "${intent.query}" ~ "${posterInfo.query}"`);
            intent.query = posterInfo.query || intent.query;
            if (posterInfo.year) intent.year = posterInfo.year;
            if (posterInfo.language) intent.language = posterInfo.language;
            if (posterInfo.origin) intent.origin = posterInfo.origin;
            if (posterInfo.type) intent.type = posterInfo.type;
            intent.verified = true;
        } else {
            console.log(`[AIVerifier] ⚠️ User title "${userText}" differs from poster image "${posterInfo.query}". Combining hints...`);
            if (posterInfo.year && !intent.year) intent.year = posterInfo.year;
            if (posterInfo.language && !intent.language) intent.language = posterInfo.language;
            if (posterInfo.origin && intent.origin === 'non-indian') intent.origin = posterInfo.origin;
            intent.verified = false;
        }
    }
    return intent;
}



module.exports = {
    translateAudio,
    transcribeAudio,
    extractSearchIntent,
    understandUniversalIntent,
    verifyPosterWithUserTitle,
    selectBestMatch
};


