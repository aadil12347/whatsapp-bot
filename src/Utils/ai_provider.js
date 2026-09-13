require('dotenv').config({ path: './config.env' });
const axios = require('axios');
const FormData = require('form-data');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

/**
 * Transcribes and translates audio buffer to English text using Groq Whisper Large v3
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
        form.append('prompt', 'Transcribe movie titles, TV series, season numbers, episode numbers, and qualities accurately, e.g. Stree 2, Pushpa 2, Stranger Things Season 2 Episode 4, 720p, 1080p, Hindi, English');

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
 * Transcribes audio buffer using Groq Whisper Large v3
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
        form.append('prompt', 'Transcribe movie and TV show titles, season numbers, episodes, e.g. Stree 2, Pushpa 2, Stranger Things, Season 2, Episode 5, 720p, 1080p');

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
- "year": 4-digit release year if mentioned or strongly associated, else null
- "resolution": requested quality ("480p", "720p", "1080p", "4k"). DEFAULT to "720p" if unspecified.
- "type": "movie" or "series" (detect based on words like "season", "episode", "s01", "series", "tv", "part 2" vs "movie")
- "season": season number if mentioned as integer (e.g. 2 for "season 2"), else null
- "episode": episode number if mentioned as integer (e.g. 5 for "episode 5"), else null
- "origin": "indian" (if Bollywood, Hindi, Urdu, South Indian, Tamil, Telugu, Punjabi, Malayalam) OR "non-indian" (if Hollywood, English, Korean, Anime, Foreign)

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
    const isIndian = /hindi|bollywood|punjabi|tamil|telugu|malayalam|stree|pushpa|jawan|pathaan|rrx|kgf/i.test(cleanText);
    return {
        query: cleanText.replace(/1080p|720p|480p|4k|movie|series|\b(19\d\d|20\d\d)\b/gi, '').trim(),
        year: yearMatch ? yearMatch[1] : null,
        resolution: resMatch ? resMatch[0].toLowerCase() : '720p',
        type: isSeries ? 'series' : 'movie',
        season: null,
        episode: null,
        origin: isIndian ? 'indian' : 'non-indian'
    };
}

/**
 * Evaluates candidate posts scraped from Vegamovies/Rogmovies against TMDB info using AI
 */
async function selectBestMatch(tmdbInfo, candidates, targetResolution = '720p') {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    if (!GROQ_KEY) return candidates[0];

    const prompt = `User search request:
Title: ${tmdbInfo?.title || 'Unknown'}
Release Year: ${tmdbInfo?.year || 'Unknown'}
Target Quality: ${targetResolution}

Scraped Candidate Posts:
${candidates.map((c, i) => `[Index ${i}] Title: "${c.title}" | Site: ${c.site} | URL: ${c.link}`).join('\n')}

Select the SINGLE best candidate post index that matches the title, year, and requested quality (${targetResolution}).
IMPORTANT PREFERENCE: If multiple candidate posts match the requested title, strongly prioritize posts that contain 'Hindi' (Dual Audio / Multi Audio / Hindi ORG) over English-only or non-Hindi posts.
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

module.exports = {
    translateAudio,
    transcribeAudio,
    extractSearchIntent,
    selectBestMatch
};
