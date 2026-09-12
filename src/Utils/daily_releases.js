const fs = require('fs');
const path = require('path');

const RELEASES_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases.json');
const STATE_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases_state.json');

// ─── Constants ──────────────────────────────────────────────────
const ARCHIVE_DAYS = 7; // Keep releases for 7 days

/**
 * Returns a Date object representing the 01:00 AM cutoff for the current 24-hour cycle.
 * If current time is e.g. 7:30 PM on Sept 11, cutoff is Sept 11 01:00:00 AM.
 * If current time is 00:30 AM on Sept 11, cutoff is Sept 10 01:00:00 AM.
 */
function getDailyCutoffTime(now = new Date()) {
    const cutoff = new Date(now);
    if (now.getHours() < 1) {
        cutoff.setDate(cutoff.getDate() - 1);
    }
    cutoff.setHours(1, 0, 0, 0); // 01:00:00.000 AM
    return cutoff;
}

/**
 * Returns a formatted date string like "11 Sept 2026" for the current cycle.
 */
function getCycleDateString(now = new Date()) {
    const cutoff = getDailyCutoffTime(now);
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return cutoff.toLocaleDateString('en-GB', options);
}

/**
 * Returns the 1:00 AM cutoff for a given date's cycle.
 * @param {Date} date - Any date; the cutoff is the 1:00 AM of that date's day
 */
function getCutoffForDate(date) {
    const cutoff = new Date(date);
    cutoff.setHours(1, 0, 0, 0);
    return cutoff;
}

/**
 * Returns the cycle date key (e.g. "2026-09-11") for a given timestamp.
 * A timestamp at 00:30 AM Sept 11 belongs to the Sept 10 cycle.
 */
function getCycleDateKey(timestampMs) {
    const d = new Date(timestampMs);
    if (d.getHours() < 1) {
        d.setDate(d.getDate() - 1);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a cycle date key back to a display string like "11 Sept 2026"
 */
function dateKeyToDisplayString(dateKey) {
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-GB', options);
}

/**
 * Returns the day-of-week name for a date key like "2026-09-11"
 */
function dateKeyToDayName(dateKey) {
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    return d.toLocaleDateString('en-GB', { weekday: 'long' });
}

// ─── Load / Save ────────────────────────────────────────────────

/**
 * Loads ALL releases from session/daily_releases.json, purging entries older than 7 days.
 */
function loadAllReleases() {
    // 7-day purge cutoff: 1:00 AM, (ARCHIVE_DAYS) days ago
    const now = new Date();
    const purgeCutoff = getDailyCutoffTime(now);
    purgeCutoff.setDate(purgeCutoff.getDate() - (ARCHIVE_DAYS - 1));
    const purgeCutoffMs = purgeCutoff.getTime();

    if (!fs.existsSync(RELEASES_FILE)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(RELEASES_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return [];

        // Purge items older than 7-day window
        const validItems = data.filter(item => item.timestamp && item.timestamp >= purgeCutoffMs);

        // If items were purged, save updated list
        if (validItems.length !== data.length) {
            saveDailyReleases(validItems);
        }

        return validItems;
    } catch (e) {
        console.error('[DailyReleases] Error reading releases cache:', e.message);
        return [];
    }
}

/**
 * Loads daily releases for TODAY's cycle only (1:00 AM cutoff).
 * This maintains backward compatibility with existing code.
 */
function loadDailyReleases() {
    const allItems = loadAllReleases();
    const todayCutoffMs = getDailyCutoffTime().getTime();
    return allItems.filter(item => item.timestamp >= todayCutoffMs);
}

/**
 * Loads releases for a specific date cycle.
 * @param {string} dateKey - Date key like "2026-09-11"
 * @returns {Array} releases for that day's cycle (1 AM to next day 1 AM)
 */
function loadReleasesForDate(dateKey) {
    const allItems = loadAllReleases();
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    const cycleStart = new Date(yyyy, mm - 1, dd, 1, 0, 0, 0); // 1:00 AM of dateKey
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 1); // 1:00 AM next day

    const startMs = cycleStart.getTime();
    const endMs = cycleEnd.getTime();

    return allItems.filter(item => item.timestamp >= startMs && item.timestamp < endMs);
}

/**
 * Returns available days (with release counts) from the archive.
 * @returns {Array<{dateKey: string, displayDate: string, dayName: string, count: number, isToday: boolean}>}
 */
function getAvailableDays() {
    const allItems = loadAllReleases();
    const todayKey = getCycleDateKey(Date.now());

    // Group items by cycle date key
    const dayCounts = {};
    for (const item of allItems) {
        const key = getCycleDateKey(item.timestamp);
        if (!dayCounts[key]) dayCounts[key] = 0;
        dayCounts[key]++;
    }

    // Convert to sorted array (newest first)
    const days = Object.keys(dayCounts)
        .sort((a, b) => b.localeCompare(a))
        .map(dateKey => ({
            dateKey,
            displayDate: dateKeyToDisplayString(dateKey),
            dayName: dateKeyToDayName(dateKey),
            count: dayCounts[dateKey],
            isToday: dateKey === todayKey
        }));

    return days;
}

/**
 * Saves daily releases to session/daily_releases.json
 */
function saveDailyReleases(items) {
    try {
        const dir = path.dirname(RELEASES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(RELEASES_FILE, JSON.stringify(items, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DailyReleases] Error writing releases cache:', e.message);
    }
}

// ─── Add Release ────────────────────────────────────────────────

/**
 * Adds a release item (movie or TV series) to the archive.
 * @param {Object} params
 * @param {string} params.title - Title of the release
 * @param {string} params.year - Year
 * @param {string} params.season - Season label (e.g. "S01")
 * @param {boolean} params.isSeries - Whether it's a series
 * @param {string} params.groupJid - Group JID
 * @param {string} [params.source] - "p_command" or "group_scan"
 * @param {number} [params.timestamp] - Custom timestamp (default: now)
 */
function addDailyRelease({ title, year, season, isSeries, groupJid, source, timestamp }) {
    if (!title) return null;

    const cleanTitle = title.replace(/[*_`]/g, '').trim();

    // Skip trailers, teasers, previews
    if (/\b(trailer|teaser|preview|promo|taser|trailor)\b/i.test(cleanTitle)) {
        console.log(`[DailyReleases] Skipped trailer item: "${cleanTitle}"`);
        return null;
    }

    const items = loadAllReleases();
    const now = timestamp || Date.now();

    const cleanYear = year ? String(year).replace(/[*_`]/g, '').trim() : '';
    const cleanSeason = season ? String(season).replace(/[*_`]/g, '').toUpperCase().trim() : (isSeries ? 'S01' : null);

    // Determine cycle date key for the item
    const itemCycleKey = getCycleDateKey(now);

    // Check for existing item to avoid duplicate entries on the SAME DAY
    const duplicate = items.find(item => {
        const sameTitle = item.title.toLowerCase() === cleanTitle.toLowerCase();
        const sameSeason = (item.season || '').toUpperCase() === (cleanSeason || '').toUpperCase();
        const sameCycle = getCycleDateKey(item.timestamp) === itemCycleKey;
        return sameTitle && sameSeason && sameCycle;
    });

    if (duplicate) {
        // Update timestamp to keep fresh, upgrade source if needed
        duplicate.timestamp = now;
        if (source === 'p_command' && duplicate.source !== 'p_command') {
            duplicate.source = 'p_command';
        }
        saveDailyReleases(items);
        return duplicate;
    }

    const newItem = {
        title: cleanTitle,
        year: cleanYear || 'N/A',
        season: cleanSeason,
        isSeries: !!isSeries || !!cleanSeason,
        groupJid: groupJid || '',
        source: source || 'p_command',
        timestamp: now
    };

    items.push(newItem);
    saveDailyReleases(items);
    console.log(`[DailyReleases] Added release: ${newItem.title} (${newItem.year}) ${newItem.season || ''} [${newItem.source}]`);
    return newItem;
}

// ─── Caption Parser ─────────────────────────────────────────────

/**
 * Parses title, year, season, and media type from a message caption or filename.
 * Used by the passive group scanner to extract release info from bot's own posts.
 * @param {string} text - Caption or filename text
 * @returns {Object|null} { title, year, season, isSeries } or null if unparseable
 */
function parseMediaCaption(text) {
    if (!text || typeof text !== 'string') return null;

    let cleanText = text.trim();

    // Skip trailer / teaser posts
    if (/\b(trailer|teaser|preview|promo|taser|trailor)\b/i.test(cleanText)) {
        return null;
    }

    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    let title = '';
    let year = '';
    let season = '';
    let isSeries = false;

    // Check structured TMDB caption format first (from .p command posts)
    // e.g. "📝 *Title:* *Oppenheimer*"  "📅 *Year:* *2023*"  "📺 *Season:* *S02*"
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

    // Unstructured text fallback / regex parsing (for filenames, etc.)
    if (!title) {
        // Try extracting Season info: S01, S1, Season 1
        const sMatch = cleanText.match(/\b(S\d{1,2}|Season\s*\d{1,2})\b/i);
        if (sMatch) {
            isSeries = true;
            const num = sMatch[1].replace(/[^0-9]/g, '');
            if (num) season = `S${String(num).padStart(2, '0')}`;
        }

        // Try extracting Year info: 1990-2029
        const yMatch = cleanText.match(/\b(19\d{2}|20\d{2})\b/);
        if (yMatch) {
            year = yMatch[1];
        }

        // Clean title candidate from first line
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

    // Skip if title is just branding/footer/noise or contains trailer
    if (/^(DanieWatch|『.*𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯.*』|Enjoy watching|Total|───)/i.test(title)) return null;
    if (/\b(trailer|teaser|preview|promo|taser|trailor)\b/i.test(title)) return null;

    return {
        title,
        year: year || 'N/A',
        season: isSeries ? (season || 'S01') : null,
        isSeries: isSeries || !!season
    };
}

// ─── Last Sent Message State ────────────────────────────────────
// Tracks the last sent daily-release message so we can delete it
// before sending an updated one on the same day.

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        }
    } catch (_) {}
    return {};
}

function saveState(state) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DailyReleases] Error writing state:', e.message);
    }
}

/**
 * Returns the last sent message info for today's cycle, or null.
 * Shape: { key: { remoteJid, id, fromMe, participant }, cycleDate: "11 Sept 2026" }
 */
function getLastSentMessage() {
    const state = loadState();
    const todayCycle = getCycleDateString();
    if (state.lastSentMessage && state.lastSentMessage.cycleDate === todayCycle) {
        return state.lastSentMessage;
    }
    return null;
}

/**
 * Stores the last sent message key so it can be deleted on re-send.
 */
function setLastSentMessage(msgKey) {
    const state = loadState();
    state.lastSentMessage = {
        key: msgKey,
        cycleDate: getCycleDateString()
    };
    saveState(state);
}

/**
 * Clears the last sent message (called after next-day cycle resets).
 */
function clearLastSentMessage() {
    const state = loadState();
    delete state.lastSentMessage;
    saveState(state);
}

// ─── Formatters ─────────────────────────────────────────────────

/**
 * Formats the daily releases into a designed and beautiful WhatsApp markdown list.
 * Items are sorted chronologically (oldest first → latest last).
 * This is for TODAY's releases only (backward compatible).
 */
function formatDailyReleaseList(groupName = '') {
    const items = loadDailyReleases();

    // Sort chronologically: oldest first → latest last
    items.sort((a, b) => a.timestamp - b.timestamp);

    const dateStr = getCycleDateString();

    const movies = items.filter(i => !i.isSeries);
    const series = items.filter(i => i.isSeries);
    const totalCount = items.length;

    let text = `┌─ ✨ *DANIEWATCH DAILY* ✨ ─┐\n` +
               `📅 *Date:* \`${dateStr}\`\n` +
               `─────────────────────\n\n`;

    if (movies.length > 0) {
        text += `🎬 *MOVIES TODAY* (${movies.length}):\n`;
        movies.forEach((m, idx) => {
            const yrStr = m.year && m.year !== 'N/A' ? ` (${m.year})` : '';
            text += `${idx + 1}. *${m.title}*${yrStr}\n`;
        });
        text += `\n`;
    }

    if (series.length > 0) {
        text += `🎬 *SERIES TODAY* (${series.length}):\n`;
        series.forEach((s, idx) => {
            const yrStr = s.year && s.year !== 'N/A' ? ` (${s.year})` : '';
            const sLabel = s.season ? ` - *${s.season}*` : '';
            text += `${idx + 1}. *${s.title}*${yrStr}${sLabel}\n`;
        });
        text += `\n`;
    }

    if (totalCount === 0) {
        text += `💡 *No releases uploaded yet today.*\n\n`;
    }

    text += `─────────────────────\n` +
            `🔥 *Total Today:* *${totalCount}*\n` +
            `🍿 *Enjoy watching @all*\n\n` +
            `👑 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 👑`;

    return text;
}

/**
 * Formats the release list for a SPECIFIC date cycle.
 * Used by the .history command when a day is selected.
 * @param {string} dateKey - Date key like "2026-09-11"
 * @param {string} [groupName] - Optional group name
 * @returns {string} Formatted WhatsApp message
 */
function formatDailyReleaseListForDate(dateKey, groupName = '') {
    const items = loadReleasesForDate(dateKey);

    // Sort chronologically: oldest first → latest last
    items.sort((a, b) => a.timestamp - b.timestamp);

    // Deduplicate by title+season (case-insensitive)
    const seen = new Set();
    const uniqueItems = items.filter(item => {
        const key = `${item.title.toLowerCase()}_${(item.season || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const displayDate = dateKeyToDisplayString(dateKey);
    const dayName = dateKeyToDayName(dateKey);
    const todayKey = getCycleDateKey(Date.now());
    const isToday = dateKey === todayKey;

    const movies = uniqueItems.filter(i => !i.isSeries);
    const series = uniqueItems.filter(i => i.isSeries);
    const totalCount = uniqueItems.length;

    const dayLabel = isToday ? 'TODAY' : dayName.toUpperCase();

    let text = `┌─ ✨ *DANIEWATCH DAILY* ✨ ─┐\n` +
               `📅 *${dayLabel}:* \`${displayDate}\`\n` +
               `─────────────────────\n\n`;

    if (movies.length > 0) {
        text += `🎬 *MOVIES* (${movies.length}):\n`;
        movies.forEach((m, idx) => {
            const yrStr = m.year && m.year !== 'N/A' ? ` (${m.year})` : '';
            text += `${idx + 1}. *${m.title}*${yrStr}\n`;
        });
        text += `\n`;
    }

    if (series.length > 0) {
        text += `🎬 *SERIES* (${series.length}):\n`;
        series.forEach((s, idx) => {
            const yrStr = s.year && s.year !== 'N/A' ? ` (${s.year})` : '';
            const sLabel = s.season ? ` - *${s.season}*` : '';
            text += `${idx + 1}. *${s.title}*${yrStr}${sLabel}\n`;
        });
        text += `\n`;
    }

    if (totalCount === 0) {
        text += `💡 *No releases were uploaded on this day.*\n\n`;
    }

    text += `─────────────────────\n` +
            `🔥 *Total:* *${totalCount}*\n` +
            `🍿 *Enjoy watching @all*\n\n` +
            `👑 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 👑`;

    return text;
}

/**
 * Formats the .history day-picker menu showing available days with release counts.
 * @returns {string} Formatted WhatsApp message with numbered day options
 */
function formatHistoryMenu() {
    const days = getAvailableDays();

    let text = `╭─── 📜 *DANIEWATCH HISTORY* 📜 ───╮\n\n` +
               `┌─❒ *Last ${ARCHIVE_DAYS} Days Archive*\n`;

    if (days.length === 0) {
        text += `│ 💡 _No releases recorded in the last ${ARCHIVE_DAYS} days._\n`;
    } else {
        days.forEach((day, idx) => {
            const todayBadge = day.isToday ? ' _(Today)_' : '';
            text += `│  \`${idx + 1}.\` 📅 *${day.displayDate}* — *${day.dayName}*${todayBadge}\n`;
            text += `│       🎬 ${day.count} release${day.count !== 1 ? 's' : ''}\n`;
        });
    }

    text += `└───────────────\n\n` +
            `_Reply with a day number (e.g. \`1\`) to send that day's list to the group._`;

    return text;
}

module.exports = {
    getDailyCutoffTime,
    getCycleDateString,
    getCycleDateKey,
    dateKeyToDisplayString,
    dateKeyToDayName,
    loadAllReleases,
    loadDailyReleases,
    loadReleasesForDate,
    getAvailableDays,
    saveDailyReleases,
    addDailyRelease,
    parseMediaCaption,
    formatDailyReleaseList,
    formatDailyReleaseListForDate,
    formatHistoryMenu,
    getLastSentMessage,
    setLastSentMessage,
    clearLastSentMessage
};
