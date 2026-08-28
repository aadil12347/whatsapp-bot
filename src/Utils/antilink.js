const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../session/download_settings.json');

function getAntilinkData() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            return {
                enabled: data.antilink !== false,
                groups: Array.isArray(data.antilinkGroups) ? data.antilinkGroups : []
            };
        }
    } catch (_) {}
    return { enabled: true, groups: [] };
}

function saveAntilinkData(enabled, groups) {
    try {
        let data = {};
        if (fs.existsSync(SETTINGS_PATH)) {
            try { data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); } catch (_) {}
        }
        data.antilink = !!enabled;
        data.antilinkGroups = Array.isArray(groups) ? groups : [];
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
        return data;
    } catch (err) {
        console.error('Error saving antilink data:', err.message);
        return { enabled: false, groups: [] };
    }
}

function isAntilinkActiveForGroup(groupJid) {
    const { enabled, groups } = getAntilinkData();
    if (!enabled) return false;
    if (!groupJid) return false;
    if (groups.length === 0) return true; // Applies to all groups if list empty
    const cleanGroup = groupJid.split('@')[0];
    return groups.some(g => g.includes(cleanGroup) || g === 'all');
}

function addGroupToAntilink(groupJid) {
    const { enabled, groups } = getAntilinkData();
    const cleanJid = groupJid.trim();
    if (!groups.includes(cleanJid)) {
        groups.push(cleanJid);
    }
    saveAntilinkData(enabled, groups);
    return groups;
}

function removeGroupFromAntilink(groupJid) {
    const { enabled, groups } = getAntilinkData();
    const cleanGroup = groupJid.trim().split('@')[0];
    const filtered = groups.filter(g => !g.includes(cleanGroup));
    saveAntilinkData(enabled, filtered);
    return filtered;
}

// Silva MD Bot exact URL detection regex (detects all protocols, www, and domain TLD links)
const URL_REGEX = /(?:https?:\/\/|www\.)\S+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gg|me|ly|co|app|xyz|info|tv|link|shop|live|club|online|site|store|pro|in|ng|ke|tz|ug|za|uk)\b(?:\/\S*)?/gi;

function containsForbiddenLink(text) {
    if (!text) return false;
    URL_REGEX.lastIndex = 0;
    return URL_REGEX.test(text);
}

module.exports = {
    getAntilinkData,
    saveAntilinkData,
    isAntilinkActiveForGroup,
    addGroupToAntilink,
    removeGroupFromAntilink,
    containsForbiddenLink,
    URL_REGEX
};
