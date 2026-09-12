const fs = require('fs');
const path = require('path');

const DOMAINS_FILE = path.join(__dirname, '../data/domains.json');

const DEFAULT_DOMAINS = {
    rogmovies: 'https://new2.rogmovies.click/',
    vegamovies: 'https://new2.vegamovies.futbol/'
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

function getDomains() {
    ensureDomainsFile();
    try {
        const raw = fs.readFileSync(DOMAINS_FILE, 'utf8');
        const data = JSON.parse(raw);
        return {
            rogmovies: normalizeUrl(data.rogmovies || DEFAULT_DOMAINS.rogmovies),
            vegamovies: normalizeUrl(data.vegamovies || DEFAULT_DOMAINS.vegamovies)
        };
    } catch (err) {
        console.error('[DomainManager] Read error:', err.message);
        return { ...DEFAULT_DOMAINS };
    }
}

function getDomain(siteName) {
    const domains = getDomains();
    const key = (siteName || '').toLowerCase().trim();
    if (key.includes('rog')) return domains.rogmovies;
    if (key.includes('vega')) return domains.vegamovies;
    return domains[key] || DEFAULT_DOMAINS.vegamovies;
}

function setDomain(siteChoice, newUrl) {
    ensureDomainsFile();
    if (!newUrl) {
        return { success: false, error: 'No URL provided' };
    }

    let siteKey = null;
    const choice = String(siteChoice).trim().toLowerCase();
    if (choice === '1' || choice === 'rog' || choice === 'rogmovies') {
        siteKey = 'rogmovies';
    } else if (choice === '2' || choice === 'vega' || choice === 'vegamovies') {
        siteKey = 'vegamovies';
    } else {
        return { success: false, error: 'Invalid site selection. Use 1 for Rogmovies or 2 for Vegamovies.' };
    }

    const cleanUrl = normalizeUrl(newUrl);
    try {
        const current = getDomains();
        current[siteKey] = cleanUrl;
        fs.writeFileSync(DOMAINS_FILE, JSON.stringify(current, null, 2), 'utf8');
        console.log(`[DomainManager] Updated ${siteKey} domain to ${cleanUrl}`);
        return {
            success: true,
            site: siteKey === 'rogmovies' ? 'Rogmovies' : 'Vegamovies',
            siteKey,
            url: cleanUrl
        };
    } catch (err) {
        console.error('[DomainManager] Save error:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    getDomains,
    getDomain,
    setDomain,
    DEFAULT_DOMAINS
};
