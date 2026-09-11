const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('anju-xpro-baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../session');
const TARGET_GROUP_JID = '120363263215689587@g.us'; // Group 10

/**
 * Calculates the cutoff Date object (1:00 AM of current cycle)
 */
function getTodayCutoff(now = new Date()) {
    const cutoff = new Date(now);
    if (now.getHours() < 1) {
        // Before 1 AM, the cycle started yesterday at 1 AM
        cutoff.setDate(cutoff.getDate() - 1);
    }
    cutoff.setHours(1, 0, 0, 0); // 01:00:00.000 AM
    return cutoff;
}

/**
 * Parses title, year, season, and media type from a message caption or filename
 */
function parseMediaInfo(text) {
    if (!text || typeof text !== 'string') return null;

    let cleanText = text.trim();
    // Normalize newlines
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    let title = '';
    let year = '';
    let season = '';
    let isSeries = false;

    // Check structured TMDB caption format first (e.g., Title: ..., Year: ..., Season: ...)
    for (const line of lines) {
        if (/^📝?\s*\*?Title:\*?\s*(.+)$/i.test(line)) {
            title = line.match(/^📝?\s*\*?Title:\*?\s*(.+)$/i)[1].replace(/[*_`]/g, '').trim();
        }
        if (/^📅?\s*\*?Year:\*?\s*(.+)$/i.test(line)) {
            year = line.match(/^📅?\s*\*?Year:\*?\s*(.+)$/i)[1].replace(/[*_`]/g, '').trim();
        }
        if (/^📺?\s*\*?Season:\*?\s*(.+)$/i.test(line)) {
            isSeries = true;
            const sMatch = line.match(/S(\d{1,2})/i) || line.match(/Season\s*(\d{1,2})/i);
            if (sMatch) {
                season = `S${String(sMatch[1]).padStart(2, '0')}`;
            } else {
                season = line.match(/^📺?\s*\*?Season:\*?\s*(.+)$/i)[1].replace(/[*_`]/g, '').trim();
            }
        }
    }

    // Unstructured text fallback / regex parsing
    if (!title) {
        // Try extracting Season info: S01, S1, Season 1
        const sMatch = cleanText.match(/\b(S\d{1,2}|Season\s*\d{1,2})\b/i);
        if (sMatch) {
            isSeries = true;
            const num = sMatch[1].replace(/[^0-9]/g, '');
            if (num) season = `S${String(num).padStart(2, '0')}`;
        }

        // Try extracting Year info: (2020)-(2029) or 1990-2029
        const yMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
        if (yMatch) {
            year = yMatch[1];
        }

        // Clean title candidate
        let candidate = lines[0] || cleanText;
        candidate = candidate.replace(/[*_`]/g, '');
        candidate = candidate.replace(/\b(19\d{2}|20\d{2})\b/g, '');
        candidate = candidate.replace(/\b(S\d{1,2}|Season\s*\d{1,2})\b/gi, '');
        candidate = candidate.replace(/[\(\)\[\]\-]/g, ' ').replace(/\s+/g, ' ').trim();
        
        if (candidate.length > 2) {
            title = candidate;
        }
    }

    if (!title) return null;

    return {
        title,
        year: year || 'N/A',
        season: isSeries ? (season || 'S01') : null,
        isSeries: isSeries || !!season,
        rawText: text
    };
}

/**
 * Format daily releases list in designed & beautiful presentation
 */
function formatDailyList(mediaItems, cutoffDate) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = cutoffDate.toLocaleDateString('en-GB', options);
    
    // Group into movies vs series and deduplicate
    const movies = [];
    const series = [];

    const seenMovies = new Set();
    const seenSeries = new Set();

    mediaItems.forEach(item => {
        if (item.isSeries) {
            const key = `${item.title.toLowerCase()}_${item.season.toLowerCase()}`;
            if (!seenSeries.has(key)) {
                seenSeries.add(key);
                series.push(item);
            }
        } else {
            const key = item.title.toLowerCase();
            if (!seenMovies.has(key)) {
                seenMovies.add(key);
                movies.push(item);
            }
        }
    });

    const totalCount = movies.length + series.length;

    let output = `╭─────────────────────────────╮\n` +
                 `   ✨ *DANIEWATCH DAILY RELEASES* ✨\n` +
                 `╰─────────────────────────────╯\n\n` +
                 `📅 *Date:* \`${dateStr}\`\n` +
                 `⏰ *Resets Daily:* \`01:00 AM\`\n` +
                 `───────────────────────────────\n\n`;

    if (movies.length > 0) {
        output += `🎬 *TODAY'S MOVIES* (${movies.length}):\n`;
        movies.forEach((m, i) => {
            const yrStr = m.year && m.year !== 'N/A' ? ` (${m.year})` : '';
            output += `  \`${i + 1}.\` 🎬 *${m.title}*${yrStr}\n`;
        });
        output += `\n`;
    }

    if (series.length > 0) {
        output += `📺 *TODAY'S SERIES & SEASONS* (${series.length}):\n`;
        series.forEach((s, i) => {
            const yrStr = s.year && s.year !== 'N/A' ? ` (${s.year})` : '';
            output += `  \`${i + 1}.\` 📺 *${s.title}*${yrStr} — *${s.season}*\n`;
        });
        output += `\n`;
    }

    if (totalCount === 0) {
        output += `💡 *No new releases uploaded yet today (after 01:00 AM).*\n\n`;
    }

    output += `───────────────────────────────\n` +
              `🔥 *Total Releases Uploaded Today:* *${totalCount}*\n` +
              `🍿 *Enjoy watching on DanieWatch!*\n` +
              `👑 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 👑`;

    return output;
}

// Sample test items representing parsed posts sent to Group 10
const samplePosts = [
    { title: 'Oppenheimer', year: '2023', season: null, isSeries: false },
    { title: 'Avatar: The Way of Water', year: '2022', season: null, isSeries: false },
    { title: 'House of the Dragon', year: '2022', season: 'S02', isSeries: true },
    { title: 'The Boys', year: '2019', season: 'S04', isSeries: true },
    { title: 'Stranger Things', year: '2016', season: 'S04', isSeries: true },
    { title: 'Dune: Part Two', year: '2024', season: null, isSeries: false }
];

const cutoff = getTodayCutoff();
const formatted = formatDailyList(samplePosts, cutoff);

console.log('=== TEST FORMATTED OUTPUT ===');
console.log(formatted);
console.log('=============================');
