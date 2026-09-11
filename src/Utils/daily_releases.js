const fs = require('fs');
const path = require('path');

const RELEASES_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases.json');
const STATE_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases_state.json');

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
function getCycleDateString() {
    const cutoff = getDailyCutoffTime();
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return cutoff.toLocaleDateString('en-GB', options);
}

/**
 * Loads daily releases from session/daily_releases.json, purging any records older than 1:00 AM.
 */
function loadDailyReleases() {
    const cutoff = getDailyCutoffTime();
    const cutoffMs = cutoff.getTime();

    if (!fs.existsSync(RELEASES_FILE)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(RELEASES_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return [];

        // Purge items before 1:00 AM cutoff
        const validItems = data.filter(item => item.timestamp && item.timestamp >= cutoffMs);

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

/**
 * Adds a release item (movie or TV series) to today's list
 */
function addDailyRelease({ title, year, season, isSeries, groupJid }) {
    if (!title) return;

    const items = loadDailyReleases();
    const now = Date.now();

    const cleanTitle = title.replace(/[*_`]/g, '').trim();
    const cleanYear = year ? String(year).replace(/[*_`]/g, '').trim() : '';
    const cleanSeason = season ? String(season).replace(/[*_`]/g, '').toUpperCase().trim() : (isSeries ? 'S01' : null);

    // Check for existing item to avoid duplicate entries on the same day
    const duplicate = items.find(item => {
        const sameTitle = item.title.toLowerCase() === cleanTitle.toLowerCase();
        const sameSeason = (item.season || '').toUpperCase() === (cleanSeason || '').toUpperCase();
        return sameTitle && sameSeason;
    });

    if (duplicate) {
        // Update timestamp to keep fresh
        duplicate.timestamp = now;
        saveDailyReleases(items);
        return duplicate;
    }

    const newItem = {
        title: cleanTitle,
        year: cleanYear || 'N/A',
        season: cleanSeason,
        isSeries: !!isSeries || !!cleanSeason,
        groupJid: groupJid || '',
        timestamp: now
    };

    items.push(newItem);
    saveDailyReleases(items);
    console.log(`[DailyReleases] Added today's release: ${newItem.title} (${newItem.year}) ${newItem.season || ''}`);
    return newItem;
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

/**
 * Formats the daily releases into a designed and beautiful WhatsApp markdown list.
 * Items are sorted chronologically (oldest first → latest last).
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
            text += `  \`${idx + 1}.\` 🎬 *${m.title}*${yrStr}\n`;
        });
        text += `\n`;
    }

    if (series.length > 0) {
        text += `📺 *SERIES TODAY* (${series.length}):\n`;
        series.forEach((s, idx) => {
            const yrStr = s.year && s.year !== 'N/A' ? ` (${s.year})` : '';
            const sLabel = s.season ? ` — *${s.season}*` : '';
            text += `  \`${idx + 1}.\` 📺 *${s.title}*${yrStr}${sLabel}\n`;
        });
        text += `\n`;
    }

    if (totalCount === 0) {
        text += `💡 *No releases uploaded yet today.*\n\n`;
    }

    text += `─────────────────────\n` +
            `🔥 *Total Today:* *${totalCount}*\n` +
            `🍿 *Enjoy watching @all*\n` +
            `👑 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 👑`;

    return text;
}

module.exports = {
    getDailyCutoffTime,
    getCycleDateString,
    loadDailyReleases,
    saveDailyReleases,
    addDailyRelease,
    formatDailyReleaseList,
    getLastSentMessage,
    setLastSentMessage,
    clearLastSentMessage
};
