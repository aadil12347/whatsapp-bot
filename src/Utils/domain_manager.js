const fs = require('fs');
const path = require('path');

const DOMAINS_FILE = path.join(__dirname, '../data/domains.json');

const DEFAULT_DOMAINS = {
    rogmovies: 'https://new2.rogmovies.click/',
    vegamovies: 'https://new2.vegamovies.futbol/',
    hostPriority: ['10gbps', 'fslv2', 'fsl', 'vcloud', 'gofile', 'pixeldrain']
};

function ensureDomainsFile() {
    try {
        const dir = path.dirname(DOMAINS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(DOMAINS_FILE)) {
            fs.writeFileSync(DOMAINS_FILE, JSON.stringify(DEFAULT_DOMAINS, null, 2), 'utf8');
        }
    } catch (err) {
        console.error('[DomainManager] Error ensuring domains file:', err.message);
    }
}

function normalizeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return '';
    let clean = urlStr.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://' + clean;
    }
    if (!clean.endsWith('/')) {
        clean += '/';
    }
    return clean;
}

function getRawData() {
    ensureDomainsFile();
    try {
        const raw = fs.readFileSync(DOMAINS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('[DomainManager] Read error:', err.message);
        return { ...DEFAULT_DOMAINS };
    }
}

function getDomains() {
    const data = getRawData();
    return {
        rogmovies: normalizeUrl(data.rogmovies || DEFAULT_DOMAINS.rogmovies),
        vegamovies: normalizeUrl(data.vegamovies || DEFAULT_DOMAINS.vegamovies),
        hostPriority: Array.isArray(data.hostPriority) && data.hostPriority.length > 0
            ? data.hostPriority
            : DEFAULT_DOMAINS.hostPriority
    };
}

function getDomain(siteName) {
    const domains = getDomains();
    const key = (siteName || '').toLowerCase().trim();
    if (key.includes('rog')) return domains.rogmovies;
    if (key.includes('vega')) return domains.vegamovies;
    return domains[key] || DEFAULT_DOMAINS.vegamovies;
}

function getHostPriority() {
    const domains = getDomains();
    return domains.hostPriority || DEFAULT_DOMAINS.hostPriority;
}

function setHostPriority(priorityInput) {
    ensureDomainsFile();
    let newList = [];
    if (Array.isArray(priorityInput)) {
        newList = priorityInput;
    } else if (typeof priorityInput === 'string') {
        newList = priorityInput.split(/[\s,>]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    }

    const VALID_HOSTS = ['10gbps', 'fslv2', 'fsl', 'vcloud', 'gofile', 'pixeldrain'];
    const sanitized = [];
    for (const item of newList) {
        const matched = VALID_HOSTS.find(vh => vh === item || item.includes(vh));
        if (matched && !sanitized.includes(matched)) {
            sanitized.push(matched);
        }
    }
    // Append any unmentioned valid hosts at the end
    for (const vh of VALID_HOSTS) {
        if (!sanitized.includes(vh)) {
            sanitized.push(vh);
        }
    }

    try {
        const current = getRawData();
        current.hostPriority = sanitized;
        fs.writeFileSync(DOMAINS_FILE, JSON.stringify(current, null, 2), 'utf8');
        console.log(`[DomainManager] Updated Host Priority order to:`, sanitized);
        return {
            success: true,
            site: 'Host Priority',
            hostPriority: sanitized
        };
    } catch (err) {
        console.error('[DomainManager] Save host priority error:', err.message);
        return { success: false, error: err.message };
    }
}

function setDomain(siteChoice, value) {
    ensureDomainsFile();
    if (!value) {
        return { success: false, error: 'No value provided' };
    }

    const choice = String(siteChoice).trim().toLowerCase();
    if (choice === '1' || choice === 'rog' || choice === 'rogmovies') {
        const cleanUrl = normalizeUrl(value);
        try {
            const current = getRawData();
            current.rogmovies = cleanUrl;
            fs.writeFileSync(DOMAINS_FILE, JSON.stringify(current, null, 2), 'utf8');
            console.log(`[DomainManager] Updated rogmovies domain to ${cleanUrl}`);
            return { success: true, site: 'Rogmovies', url: cleanUrl };
        } catch (err) {
            return { success: false, error: err.message };
        }
    } else if (choice === '2' || choice === 'vega' || choice === 'vegamovies') {
        const cleanUrl = normalizeUrl(value);
        try {
            const current = getRawData();
            current.vegamovies = cleanUrl;
            fs.writeFileSync(DOMAINS_FILE, JSON.stringify(current, null, 2), 'utf8');
            console.log(`[DomainManager] Updated vegamovies domain to ${cleanUrl}`);
            return { success: true, site: 'Vegamovies', url: cleanUrl };
        } catch (err) {
            return { success: false, error: err.message };
        }
    } else if (choice === '3' || choice === 'host' || choice === 'priority' || choice === 'hosts') {
        return setHostPriority(value);
    } else {
        return { success: false, error: 'Invalid choice selection. Use 1 for Rogmovies, 2 for Vegamovies, or 3 for Host Priority.' };
    }
}

module.exports = {
    getDomains,
    getDomain,
    setDomain,
    getHostPriority,
    setHostPriority,
    DEFAULT_DOMAINS
};
