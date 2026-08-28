const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../session/download_settings.json');

// In-memory sliding window message tracker: senderJid_groupJid -> Array of { timestamp, key }
const messageTracker = new Map();

function getAntispamData() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            return {
                enabled: data.antispam !== false,
                groups: Array.isArray(data.antispamGroups) ? data.antispamGroups : [],
                limit: data.antispamLimit || 10,
                windowMs: data.antispamWindowMs || 120000 // 2 minutes (120,000 ms)
            };
        }
    } catch (_) {}
    return { enabled: true, groups: [], limit: 10, windowMs: 120000 };
}

function saveAntispamData(enabled, groups, limit = 10, windowMs = 120000) {
    try {
        let data = {};
        if (fs.existsSync(SETTINGS_PATH)) {
            try { data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch (_) {}
        }
        data.antispam = !!enabled;
        data.antispamGroups = Array.isArray(groups) ? groups : [];
        data.antispamLimit = limit;
        data.antispamWindowMs = windowMs;
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    } catch (err) {
        console.error('Error saving antispam data:', err.message);
        return { enabled: false, groups: [] };
    }
}

function isAntispamActiveForGroup(groupJid) {
    const { enabled, groups } = getAntispamData();
    if (!enabled) return false;
    if (!groupJid) return false;
    if (groups.length === 0) return true; // Applies to all groups if list empty
    const cleanGroup = groupJid.split('@')[0];
    return groups.some(g => g.includes(cleanGroup) || g === 'all');
}

function addGroupToAntispam(groupJid) {
    const { enabled, groups, limit, windowMs } = getAntispamData();
    const cleanJid = groupJid.trim();
    if (!groups.includes(cleanJid)) {
        groups.push(cleanJid);
    }
    saveAntispamData(enabled, groups, limit, windowMs);
    return groups;
}

function removeGroupFromAntispam(groupJid) {
    const { enabled, groups, limit, windowMs } = getAntispamData();
    const cleanGroup = groupJid.trim().split('@')[0];
    const filtered = groups.filter(g => !g.includes(cleanGroup));
    saveAntispamData(enabled, filtered, limit, windowMs);
    return filtered;
}

/**
 * Tracks a message sent by senderJid in groupJid.
 * Stores { timestamp, key } for every message.
 * Returns { isSpam: true, count, keysToPurge } if sender exceeds the 10 messages / 2 minutes threshold.
 */
function recordMessageAndCheckSpam(senderJid, groupJid, msgKey = null) {
    const { enabled, limit, windowMs } = getAntispamData();
    if (!enabled || !isAntispamActiveForGroup(groupJid)) {
        return { isSpam: false, count: 0, keysToPurge: [] };
    }

    const now = Date.now();
    const cleanSender = senderJid ? senderJid.split('@')[0].split(':')[0] : 'unknown';
    const cleanGroup = groupJid ? groupJid.split('@')[0] : 'unknown';
    const key = `${cleanSender}_${cleanGroup}`;
    let entries = messageTracker.get(key) || [];

    // Filter out entries older than windowMs (120,000ms = 2 min)
    entries = entries.filter(e => (now - e.timestamp) < windowMs);
    
    if (msgKey) {
        entries.push({ timestamp: now, key: msgKey });
    }
    
    messageTracker.set(key, entries);

    if (entries.length > limit) {
        const keysToPurge = entries.map(e => e.key).filter(Boolean);
        // Reset entry tracker after capturing spam keys to prevent duplicate actions
        messageTracker.set(key, []);
        return { isSpam: true, count: entries.length, keysToPurge };
    }

    return { isSpam: false, count: entries.length, keysToPurge: [] };
}

module.exports = {
    getAntispamData,
    saveAntispamData,
    isAntispamActiveForGroup,
    addGroupToAntispam,
    removeGroupFromAntispam,
    recordMessageAndCheckSpam
};
