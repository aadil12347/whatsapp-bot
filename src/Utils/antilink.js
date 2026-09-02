const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../session/download_settings.json');

function getAntilinkGroups() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            return Array.isArray(data.antilinkGroups) ? data.antilinkGroups : [];
        }
    } catch (_) {}
    return [];
}

function saveAntilinkGroups(groups) {
    try {
        let data = {};
        if (fs.existsSync(SETTINGS_PATH)) {
            try { data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch (_) {}
        }
        data.antilinkGroups = Array.isArray(groups) ? groups : [];
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return groups;
    } catch (err) {
        console.error('Error saving antilink data:', err.message);
        return [];
    }
}

// Active ONLY if this specific group JID is in the list — no global toggle
function isAntilinkActiveForGroup(groupJid) {
    if (!groupJid) return false;
    const groups = getAntilinkGroups();
    if (groups.length === 0) return false;
    const cleanGroup = groupJid.split('@')[0];
    return groups.some(g => g.includes(cleanGroup));
}

function addGroupToAntilink(groupJid) {
    const groups = getAntilinkGroups();
    const clean = groupJid.trim();
    if (!groups.includes(clean)) {
        groups.push(clean);
    }
    saveAntilinkGroups(groups);
    return groups;
}

function removeGroupFromAntilink(groupJid) {
    const groups = getAntilinkGroups();
    const cleanGroup = groupJid.trim().split('@')[0];
    const filtered = groups.filter(g => !g.includes(cleanGroup));
    saveAntilinkGroups(filtered);
    return filtered;
}

function clearAllAntilinkGroups() {
    saveAntilinkGroups([]);
    return [];
}

// URL detection regex
const URL_REGEX = /(?:https?:\/\/|www\.)\S+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gg|me|ly|co|app|xyz|info|tv|link|shop|live|club|online|site|store|pro|in|ng|ke|tz|ug|za|uk)\b(?:\/\S*)?/gi;

function containsForbiddenLink(text) {
    if (!text) return false;
    URL_REGEX.lastIndex = 0;
    return URL_REGEX.test(text);
}

module.exports = {
    getAntilinkGroups,
    saveAntilinkGroups,
    isAntilinkActiveForGroup,
    addGroupToAntilink,
    removeGroupFromAntilink,
    clearAllAntilinkGroups,
    containsForbiddenLink,
    URL_REGEX
};
