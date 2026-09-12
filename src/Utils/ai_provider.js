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
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('m4a') ? 'm4a' : 'mp3';
        form.append('file', audioBuffer, { filename: `audio.${extension}`, contentType: mimeType });
        form.append('model', 'whisper-large-v3');

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
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('m4a') ? 'm4a' : 'mp3';
        form.append('file', audioBuffer, { filename: `audio.${extension}`, contentType: mimeType });
        form.append('model', 'whisper-large-v3');

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
 * Parses user text or transcribed speech into structured movie/series search intent
 */
async function extractSearchIntent(inputPrompt) {
    if (!GROQ_KEY) {
        throw new Error("GROQ_API_KEY is not configured in config.env");
    }

    const systemPrompt = `You are a movie and TV series search assistant. Analyze the user prompt and extract search metadata into strict JSON format with keys:
- "query": clean English title of movie or TV show without resolution, year, or search words
- "year": 4-digit release year if mentioned, else null
- "resolution": requested quality ("480p", "720p", "1080p", "4k"). DEFAULT to "720p" if unspecified.
- "type": "movie" or "series" (detect based on words like "season", "episode", "s01", "series", "tv" vs "movie")
- "origin": "indian" (if Bollywood, Hindi, South Indian, Tamil, Telugu, Punjabi, Malayalam) OR "non-indian" (if Hollywood, English, Korean, Anime, Foreign)

Respond ONLY with valid JSON, no markdown wrappers, no prose.`;

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'groq/compound-mini',
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
        console.error("❌ Extract search intent error:", err.response?.data || err.message);
        // Fallback simple parsing
        const isSeries = /season|episode|s\d+/i.test(inputPrompt);
        const resMatch = inputPrompt.match(/1080p|720p|480p|4k/i);
        const yearMatch = inputPrompt.match(/\b(19\d\d|20\d\d)\b/);
        const isIndian = /hindi|bollywood|punjabi|tamil|telugu|malayalam|stree|pushpa|jawan|pathaan|rrx|kgf/i.test(inputPrompt);
        return {
            query: inputPrompt.replace(/1080p|720p|480p|4k|movie|series|\b(19\d\d|20\d\d)\b/gi, '').trim(),
            year: yearMatch ? yearMatch[1] : null,
            resolution: resMatch ? resMatch[0].toLowerCase() : '720p',
            type: isSeries ? 'series' : 'movie',
            origin: isIndian ? 'indian' : 'non-indian'
        };
    }
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
Respond ONLY with JSON: {"bestIndex": <number>, "reason": "<short explanation>"}`;

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'groq/compound-mini',
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
        console.error("❌ Select best match AI error:", err.message);
        return candidates[0];
    }
}

module.exports = {
    translateAudio,
    transcribeAudio,
    extractSearchIntent,
    selectBestMatch
};
