const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const RELEASES_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases.json');
const STATE_FILE = path.join(__dirname, '..', '..', 'session', 'daily_releases_state.json');

// ─── Constants ──────────────────────────────────────────────────
const ARCHIVE_DAYS = 7; // Keep releases for 7 days
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // Flush to Supabase every 5 minutes

// ─── Supabase Client ────────────────────────────────────────────
const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;
let _supabase = null;

function getSupabase() {
    if (_supabase) return _supabase;
    if (!SUPABASE_URL || !SUPABASE_KEY) return null;
    _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    return _supabase;
}

// ─── In-Memory Cache & Dirty Flag ───────────────────────────────
let _releasesDirty = false;
let _syncIntervalHandle = null;
let _supabaseInitialized = false;

/**
 * Pakistan Standard Time offset: UTC+5 (5 hours in milliseconds).
 * All daily cycle boundaries are based on midnight PKT.
 */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Converts a Date or timestamp to a Date whose UTC fields represent PKT time.
 * e.g. if it's 19:00 UTC (= 00:00 PKT next day), the returned Date's
 * getUTCHours() will be 0, getUTCDate() will be the next day.
 */
function toPKT(date) {
    const ms = date instanceof Date ? date.getTime() : date;
    return new Date(ms + PKT_OFFSET_MS);
}

/**
 * Returns a Date object representing midnight PKT (00:00 UTC+5) for the current day.
 * This is the cutoff that separates one day's releases from the next.
 */
function getDailyCutoffTime(now = new Date()) {
    const pkt = toPKT(now);
    // Midnight PKT of today (as UTC timestamp) = Date.UTC of the PKT date minus offset
    const midnightPktUtc = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate());
    return new Date(midnightPktUtc - PKT_OFFSET_MS);
}

/**
 * Returns a formatted date string like "12 Sept 2026" for the current cycle in PKT.
 */
function getCycleDateString(now = new Date()) {
    const pkt = toPKT(now);
    const options = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return pkt.toLocaleDateString('en-GB', options);
}

/**
 * Returns the midnight PKT cutoff for a given date's cycle.
 * @param {Date} date - Any date; returns midnight PKT of that PKT day
 */
function getCutoffForDate(date) {
    const pkt = toPKT(date);
    const midnightPktUtc = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate());
    return new Date(midnightPktUtc - PKT_OFFSET_MS);
}

/**
 * Returns the cycle date key (e.g. "2026-09-12") for a given timestamp in PKT.
 * Uses midnight PKT as the day boundary.
 */
function getCycleDateKey(timestampMs) {
    const pkt = toPKT(new Date(timestampMs));
    const yyyy = pkt.getUTCFullYear();
    const mm = String(pkt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(pkt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts a cycle date key back to a display string like "12 Sept 2026"
 */
function dateKeyToDisplayString(dateKey) {
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    // Create a UTC date so formatting is consistent across timezones
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    const options = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return d.toLocaleDateString('en-GB', options);
}

/**
 * Returns the day-of-week name for a date key like "2026-09-12"
 */
function dateKeyToDayName(dateKey) {
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

// ─── Load / Save ────────────────────────────────────────────────

/**
 * Loads ALL releases from session/daily_releases.json, purging entries older than 7 days.
 */
function loadAllReleases() {
    // 7-day purge cutoff: midnight PKT, (ARCHIVE_DAYS) days ago
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
 * Loads daily releases for TODAY's cycle only (midnight PKT cutoff).
 */
function loadDailyReleases() {
    const allItems = loadAllReleases();
    const todayCutoffMs = getDailyCutoffTime().getTime();
    return allItems.filter(item => item.timestamp >= todayCutoffMs);
}

/**
 * Loads releases for a specific date cycle.
 * @param {string} dateKey - Date key like "2026-09-12"
 * @returns {Array} releases for that day's cycle (midnight PKT to next midnight PKT)
 */
function loadReleasesForDate(dateKey) {
    const allItems = loadAllReleases();
    const [yyyy, mm, dd] = dateKey.split('-').map(Number);
    // Midnight PKT of dateKey in UTC
    const startMs = Date.UTC(yyyy, mm - 1, dd) - PKT_OFFSET_MS;
    const endMs = startMs + 24 * 60 * 60 * 1000; // Next midnight PKT

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
 * Saves daily releases to session/daily_releases.json and marks dirty for Supabase sync.
 */
function saveDailyReleases(items) {
    try {
        const dir = path.dirname(RELEASES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(RELEASES_FILE, JSON.stringify(items, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DailyReleases] Error writing releases cache:', e.message);
    }
    _releasesDirty = true;
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
    _releasesDirty = true;
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

// ─── Supabase Sync Functions ────────────────────────────────────

/**
 * Fetches releases + state from Supabase and writes them to local JSON files.
 * Called once on bot startup to restore data from the cloud.
 * Returns true if data was restored, false otherwise.
 */
async function initReleasesFromSupabase() {
    if (_supabaseInitialized) return true;
    const supabase = getSupabase();
    if (!supabase) {
        console.log('[DailyReleases] Supabase not configured — using local files only.');
        return false;
    }

    try {
        const { data, error } = await supabase
            .from('daily_releases')
            .select('releases_data, state_data, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.warn('[DailyReleases] Supabase fetch error:', error.message);
            return false;
        }

        if (!data) {
            console.log('[DailyReleases] No release data found in Supabase (first run).');
            // If we have local data, push it up to Supabase now
            const localItems = loadAllReleases();
            const localState = loadState();
            if (localItems.length > 0) {
                console.log(`[DailyReleases] Seeding ${localItems.length} local release(s) to Supabase...`);
                await _upsertToSupabase(localItems, localState);
            }
            _supabaseInitialized = true;
            return true;
        }

        const remoteReleases = Array.isArray(data.releases_data) ? data.releases_data : [];
        const remoteState = (data.state_data && typeof data.state_data === 'object') ? data.state_data : {};

        // Merge: use Supabase data as primary, but also merge any local items not in Supabase
        // (covers edge case where bot crashed before flushing)
        const localItems = loadAllReleases();
        const merged = _mergeReleases(remoteReleases, localItems);

        // Write merged data to local files
        try {
            const dir = path.dirname(RELEASES_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(RELEASES_FILE, JSON.stringify(merged, null, 2), 'utf-8');
        } catch (_) {}

        try {
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(remoteState, null, 2), 'utf-8');
        } catch (_) {}

        // If we merged new local items, mark dirty so they get pushed up
        if (merged.length > remoteReleases.length) {
            _releasesDirty = true;
        }

        console.log(`[DailyReleases] ✅ Restored ${merged.length} release(s) from Supabase (remote: ${remoteReleases.length}, local-extra: ${merged.length - remoteReleases.length}). Last updated: ${data.updated_at || 'unknown'}`);
        _supabaseInitialized = true;
        return true;
    } catch (err) {
        console.warn('[DailyReleases] Exception during Supabase init:', err.message);
        return false;
    }
}

/**
 * Merges two release arrays, deduplicating by title+season+cycleDate.
 * Remote items take priority (they're the source of truth).
 */
function _mergeReleases(remote, local) {
    const seen = new Set();
    const merged = [];

    // Add all remote items first
    for (const item of remote) {
        const key = `${(item.title || '').toLowerCase()}_${(item.season || '').toLowerCase()}_${getCycleDateKey(item.timestamp)}`;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
        }
    }

    // Add local items only if not already present
    for (const item of local) {
        const key = `${(item.title || '').toLowerCase()}_${(item.season || '').toLowerCase()}_${getCycleDateKey(item.timestamp)}`;
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
        }
    }

    return merged;
}

/**
 * Flushes in-memory releases + state to Supabase if the dirty flag is set.
 * Called periodically (every 5 min) and on graceful shutdown.
 */
async function flushReleasesToSupabase() {
    if (!_releasesDirty) return false;
    const supabase = getSupabase();
    if (!supabase) return false;

    try {
        const items = loadAllReleases();
        const state = loadState();
        await _upsertToSupabase(items, state);
        _releasesDirty = false;
        console.log(`[DailyReleases] ☁️ Flushed ${items.length} release(s) to Supabase.`);
        return true;
    } catch (err) {
        console.warn('[DailyReleases] Supabase flush error:', err.message);
        return false;
    }
}

/**
 * Internal: upserts releases + state to Supabase daily_releases table (id=1).
 */
async function _upsertToSupabase(releases, state) {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
        .from('daily_releases')
        .update({
            releases_data: releases,
            state_data: state,
            updated_at: new Date().toISOString()
        })
        .eq('id', 1);

    if (error) {
        throw new Error(`Supabase upsert failed: ${error.message}`);
    }
}

/**
 * Starts periodic sync timer (every 5 minutes).
 * Safe to call multiple times — only one timer runs.
 */
function startPeriodicSync() {
    if (_syncIntervalHandle) return; // Already running
    _syncIntervalHandle = setInterval(async () => {
        try {
            await flushReleasesToSupabase();
        } catch (_) {}
    }, SYNC_INTERVAL_MS);
    console.log(`[DailyReleases] ⏱️ Periodic Supabase sync started (every ${SYNC_INTERVAL_MS / 60000} min).`);
}

/**
 * Stops the periodic sync timer.
 */
function stopPeriodicSync() {
    if (_syncIntervalHandle) {
        clearInterval(_syncIntervalHandle);
        _syncIntervalHandle = null;
    }
}

/**
 * Final flush for graceful shutdown. Stops the timer and does one last sync.
 */
async function shutdownSync() {
    stopPeriodicSync();
    try {
        // Force dirty so we always save on shutdown
        _releasesDirty = true;
        await flushReleasesToSupabase();
        console.log('[DailyReleases] ✅ Shutdown sync complete.');
    } catch (err) {
        console.warn('[DailyReleases] Shutdown sync failed:', err.message);
    }
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
    clearLastSentMessage,
    // Supabase sync
    initReleasesFromSupabase,
    flushReleasesToSupabase,
    startPeriodicSync,
    stopPeriodicSync,
    shutdownSync
};
