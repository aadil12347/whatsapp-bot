const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../session/download_settings.json');

// In-memory sliding window message tracker: senderJid_groupJid -> Array of { timestamp, key }
const messageTracker = new Map();

function getAntispamGroups() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            return {
                groups: Array.isArray(data.antispamGroups) ? data.antispamGroups : [],
                limit: data.antispamLimit || 10,
                windowMs: data.antispamWindowMs || 120000 // 2 minutes
            };
        }
    } catch (_) {}
    return { groups: [], limit: 10, windowMs: 120000 };
}

function saveAntispamGroups(groups, limit = 10, windowMs = 120000) {
    try {
        let data = {};
        if (fs.existsSync(SETTINGS_PATH)) {
            try { data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch (_) {}
        }
        data.antispamGroups = Array.isArray(groups) ? groups : [];
        data.antispamLimit = limit;
        data.antispamWindowMs = windowMs;
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return groups;
    } catch (err) {
        console.error('Error saving antispam data:', err.message);
        return [];
    }
}

// Active ONLY if this specific group JID is in the list — no global toggle
function isAntispamActiveForGroup(groupJid) {
    if (!groupJid) return false;
    const { groups } = getAntispamGroups();
    if (groups.length === 0) return false;
    const cleanGroup = groupJid.split('@')[0];
    return groups.some(g => g.includes(cleanGroup));
}

function addGroupToAntispam(groupJid) {
    const { groups, limit, windowMs } = getAntispamGroups();
    const clean = groupJid.trim();
    if (!groups.includes(clean)) {
        groups.push(clean);
    }
    saveAntispamGroups(groups, limit, windowMs);
    return groups;
}

function removeGroupFromAntispam(groupJid) {
    const { groups, limit, windowMs } = getAntispamGroups();
    const cleanGroup = groupJid.trim().split('@')[0];
    const filtered = groups.filter(g => !g.includes(cleanGroup));
    saveAntispamGroups(filtered, limit, windowMs);
    return filtered;
}

function clearAllAntispamGroups() {
    const { limit, windowMs } = getAntispamGroups();
    saveAntispamGroups([], limit, windowMs);
    return [];
}

/**
 * Tracks a message sent by senderJid in groupJid.
 * Returns { isSpam: true, count, keysToPurge } if sender exceeds the threshold.
 */
function recordMessageAndCheckSpam(senderJid, groupJid, msgKey = null) {
    if (!isAntispamActiveForGroup(groupJid)) {
        return { isSpam: false, count: 0, keysToPurge: [] };
    }

    const { limit, windowMs } = getAntispamGroups();
    const now = Date.now();
    const cleanSender = senderJid ? senderJid.split('@')[0].split(':')[0] : 'unknown';
    const cleanGroup = groupJid ? groupJid.split('@')[0] : 'unknown';
    const key = `${cleanSender}_${cleanGroup}`;
    let entries = messageTracker.get(key) || [];

    // Filter out entries older than windowMs
    entries = entries.filter(e => (now - e.timestamp) < windowMs);
    
    if (msgKey) {
        entries.push({ timestamp: now, key: msgKey });
    }
    
    messageTracker.set(key, entries);

    if (entries.length > limit) {
        const keysToPurge = entries.map(e => e.key).filter(Boolean);
        messageTracker.set(key, []);
        return { isSpam: true, count: entries.length, keysToPurge };
    }

    return { isSpam: false, count: entries.length, keysToPurge: [] };
}

module.exports = {
    getAntispamGroups,
    saveAntispamGroups,
    isAntispamActiveForGroup,
    addGroupToAntispam,
    removeGroupFromAntispam,
    clearAllAntispamGroups,
    recordMessageAndCheckSpam
};
