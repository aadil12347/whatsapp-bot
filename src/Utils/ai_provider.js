require('dotenv').config({ path: './config.env' });
const axios = require('axios');
const FormData = require('form-data');

// GLOBAL AI DISABLE FLAG — AI features are disabled per user request
const ENABLE_AI = false;

/**
 * Transcribes and translates audio buffer — DISABLED
 */
async function translateAudio(audioBuffer, mimeType = 'audio/mp3') {
    throw new Error("Voice note feature is disabled.");
}

/**
 * Transcribes audio buffer — DISABLED
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/mp3') {
    throw new Error("Voice note feature is disabled.");
}

/**
 * Analyzes movie/series poster image buffer — DISABLED
 */
async function analyzePosterImage(imageBuffer, mimeType = 'image/jpeg') {
    return null;
}

/**
 * Parses user text into structured movie/series search intent using fast local regex parsing (AI bypassed).
 */
async function extractSearchIntent(inputPrompt) {
    let cleanText = inputPrompt || '';
    if (/streetoo|stree\s*two|stree2/i.test(cleanText)) cleanText = "Stree 2";
    if (/pushpa\s*two|pushpatwo/i.test(cleanText)) cleanText = "Pushpa 2";

    const isSeries = /season|episode|s\d+/i.test(cleanText);
    const resMatch = cleanText.match(/1080p|720p|480p|4k/i);
    const yearMatch = cleanText.match(/\b(19\d\d|20\d\d)\b/);
    const isIndian = /hindi|bollywood|punjabi|tamil|telugu|malayalam|stree|pushpa|jawan|pathaan|rrx|kgf|custody/i.test(cleanText);
    const langMatch = cleanText.match(/tamil|hindi|telugu|malayalam|punjabi|english|korean|japanese/i);
    const seasonMatch = cleanText.match(/season\s*(\d+)|\bs(\d+)\b/i);
    const epMatch = cleanText.match(/episode\s*(\d+)|\be(\d+)\b/i);

    const query = cleanText
        .replace(/\b(1080p|720p|480p|4k|movie|series)\b/gi, '')
        .replace(/\b(19\d\d|20\d\d)\b/gi, '')
        .replace(/^\.search\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        query: query || cleanText,
        year: yearMatch ? yearMatch[1] : null,
        resolution: resMatch ? resMatch[0].toLowerCase() : '720p',
        type: isSeries ? 'series' : 'movie',
        season: seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2], 10) : null,
        episode: epMatch ? parseInt(epMatch[1] || epMatch[2], 10) : null,
        origin: isIndian ? 'indian' : 'non-indian',
        language: langMatch ? langMatch[0].toLowerCase() : null,
        site: 'both',
        noPoster: /no\s*poster|dont\s*send\s*poster|without\s*poster/i.test(cleanText),
        noCaption: /no\s*caption|dont\s*send\s*caption|without\s*caption/i.test(cleanText),
        noTrailer: /no\s*trailer|dont\s*send\s*trailer|without\s*trailer/i.test(cleanText),
        addToQueue: /queue|add\s*to\s*queue/i.test(cleanText)
    };
}

function isSearchKeywordPresent(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    const hasSearchWord = /\b(search|download|dhoondo|khojo|find|get|fetch)\b/i.test(lower);
    const hasMovieOrSeasonWord = /\b(movie|movies|film|films|season|seasons|series|show|shows|episode|episodes|part\s*\d+|720p|1080p|480p|4k|poster|vegamovies|rogmovies|hdhub4u)\b/i.test(lower);

    return hasSearchWord && hasMovieOrSeasonWord;
}

/**
 * Universal Intent Router — Bypassed to direct intent
 */
async function understandUniversalIntent(inputPrompt, contextInfo = {}) {
    const baseIntent = await extractSearchIntent(inputPrompt);
    return { action: 'search_download', ...baseIntent };
}

/**
 * Select best candidate post — Bypassed to top candidate
 */
async function selectBestMatch(tmdbInfo, candidates, targetResolution = '720p', targetYear = null, targetLanguage = null) {
    if (!candidates || candidates.length === 0) return null;
    return candidates[0];
}

/**
 * Poster verification — Bypassed to user intent
 */
async function verifyPosterWithUserTitle(userText, posterInfo = null) {
    return extractSearchIntent(userText || '');
}

module.exports = {
    translateAudio,
    transcribeAudio,
    analyzePosterImage,
    extractSearchIntent,
    understandUniversalIntent,
    verifyPosterWithUserTitle,
    selectBestMatch,
    isSearchKeywordPresent
};


