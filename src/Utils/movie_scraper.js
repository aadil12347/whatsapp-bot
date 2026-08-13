const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const yts = require('yt-search');

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'fc6d85b3839330e3458701b975195487';

const browserHttpsAgent = new https.Agent({
    ciphers: [
        'TLS_AES_128_GCM_SHA256',
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384'
    ].join(':'),
    honorCipherOrder: true,
    minVersion: 'TLSv1.2'
});

// Common User-Agent list for rotation on retries
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
];

// Common browser headers to bypass Cloudflare/V-Cloud 403 blocks
const HEADERS = {
    'User-Agent': USER_AGENTS[0],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
};

// User-provided proxy list for round-robin rotation
const PROXY_POOL_RAW = [
    "198.105.121.200:6462:nsdjrpwt:odeh1yu3tv50",
    "45.38.107.97:6014:kboirlds:mluj3qcar4fp",
    "198.105.121.200:6462:kboirlds:mluj3qcar4fp",
    "38.154.185.97:6370:kboirlds:mluj3qcar4fp",
    "191.96.254.138:6185:kboirlds:mluj3qcar4fp",
    "45.38.107.97:6014:uscqaqmr:jm8g4dse9g8p",
    "38.154.185.97:6370:uscqaqmr:jm8g4dse9g8p",
    "191.96.254.138:6185:uscqaqmr:jm8g4dse9g8p"
];

function parseProxy(proxyStr) {
    if (!proxyStr || typeof proxyStr !== 'string') return null;
    try {
        const parts = proxyStr.trim().split(':');
        if (parts.length === 4) {
            const [ip, port, user, pass] = parts;
            return {
                protocol: 'http',
                host: ip,
                port: parseInt(port, 10),
                auth: { username: user, password: pass }
            };
        }
        const u = new URL(proxyStr.startsWith('http') ? proxyStr : `http://${proxyStr}`);
        const config = {
            protocol: u.protocol.replace(':', ''),
            host: u.hostname,
            port: parseInt(u.port, 10) || 80
        };
        if (u.username) {
            config.auth = {
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password || '')
            };
        }
        return config;
    } catch (e) {
        return null;
    }
}

let proxyIndex = 0;

function getNextRotatingProxy() {
    if (PROXY_POOL_RAW.length === 0) return null;
    const raw = PROXY_POOL_RAW[proxyIndex % PROXY_POOL_RAW.length];
    proxyIndex++;
    return parseProxy(raw);
}

/**
 * Fetch HTML content from URL with TLS fingerprinting bypass, dynamic headers,
 * rotating proxy support, domain mirror substitution, and web proxy fallbacks.
 */
async function fetchHtmlWithRetry(url, parentUrl = null, customProxy = null) {
    if (!url || typeof url !== 'string') throw new Error('Invalid URL provided to fetchHtmlWithRetry');
    let currentUrl = url;

    let parsedUrl;
    try { parsedUrl = new URL(currentUrl); } catch (e) {}

    const buildHeaders = (targetUrl, referer, attemptIdx = 0) => {
        let targetOrigin = '';
        try { targetOrigin = new URL(targetUrl).origin; } catch (e) {}
        let refOrigin = '';
        try { if (referer) refOrigin = new URL(referer).origin; } catch (e) {}

        const isSameSite = refOrigin && refOrigin === targetOrigin;

        return {
            'User-Agent': USER_AGENTS[attemptIdx % USER_AGENTS.length],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': isSameSite ? 'same-origin' : 'cross-site',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            ...(referer ? { 'Referer': referer, 'Origin': refOrigin || targetOrigin } : { 'Referer': targetOrigin + '/' })
        };
    };

    // Strategy 0: Rotating Working Proxies (1 Proxy Per Attempt/Step)
    const activeProxies = [];
    if (customProxy) activeProxies.push(parseProxy(customProxy));
    if (process.env.PROXY_URL) activeProxies.push(...process.env.PROXY_URL.split(',').map(parseProxy));
    
    // Add rotating proxies from filtered working pool
    for (let i = 0; i < 3; i++) {
        const rot = getNextRotatingProxy();
        if (rot) activeProxies.push(rot);
    }

    const validProxies = activeProxies.filter(Boolean);
    for (const pConfig of validProxies) {
        console.log(`[MovieScraper] Trying proxy: ${pConfig.host}:${pConfig.port} (user=${pConfig.auth?.username})`);
        try {
            const reqHeaders = buildHeaders(currentUrl, parentUrl, 0);
            const res = await axios.get(currentUrl, {
                headers: reqHeaders,
                proxy: pConfig,
                httpsAgent: browserHttpsAgent,
                timeout: 8000,
                validateStatus: (status) => status >= 200 && status < 400
            });
            const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            if (body && body.length > 200 && !body.includes('Access Denied')) {
                console.log(`[MovieScraper] Proxy fetch succeeded: ${pConfig.host}:${pConfig.port}`);
                return body;
            }
        } catch (err) {
            console.warn(`[MovieScraper] Proxy fetch failed for ${pConfig.host}:${pConfig.port}: ${err.message}`);
        }
    }

    // Strategy 1: Direct request with browser TLS agent and dynamic headers
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const reqHeaders = buildHeaders(currentUrl, parentUrl, attempt - 1);
            const res = await axios.get(currentUrl, {
                headers: reqHeaders,
                httpsAgent: browserHttpsAgent,
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: (status) => status >= 200 && status < 400
            });
            if (res.data) {
                return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            }
        } catch (err) {
            const status = err.response ? err.response.status : null;
            console.warn(`[MovieScraper] Direct fetch attempt ${attempt} failed for ${currentUrl}: ${err.message} (status=${status})`);
            if (status !== 403 && status !== 503 && attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    // Strategy 2: FlareSolverr Cloudflare Bypass Service
    const flareUrl = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
    try {
        console.log(`[MovieScraper] Trying FlareSolverr bypass for ${url} via ${flareUrl}...`);
        const fsRes = await axios.post(flareUrl, {
            cmd: 'request.get',
            url: currentUrl,
            maxTimeout: 60000
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 65000
        });
        if (fsRes.data && fsRes.data.status === 'ok' && fsRes.data.solution && fsRes.data.solution.response) {
            const body = fsRes.data.solution.response;
            if (body && body.length > 200 && !body.includes('Access Denied') && !body.includes('Just a moment...')) {
                console.log(`[MovieScraper] FlareSolverr bypass succeeded for ${url}`);
                return body;
            }
        }
    } catch (fsErr) {
        console.warn(`[MovieScraper] FlareSolverr bypass skipped/failed: ${fsErr.message}`);
    }

    // Strategy 3: Domain Mirrors (for vcloud/hubcloud/fastdl/vgmlink)
    if (parsedUrl) {
        const domain = parsedUrl.hostname.toLowerCase();
        let mirrors = [];
        if (domain.includes('vcloud') || domain.includes('hubcloud') || domain.includes('hubdrive')) {
            mirrors = ['vcloud.zip', 'vcloud.lol', 'hubcloud.link', 'hubcloud.club', 'hubdrive.space', 'hubcloud.one'];
        } else if (domain.includes('fastdl')) {
            mirrors = ['fastdl.zip', 'fastdl.app', 'fastdl.site'];
        } else if (domain.includes('vgmlink')) {
            mirrors = ['vgmlink.com', 'vgmlink.org', 'vgmlink.net'];
        }

        for (const mirror of mirrors) {
            if (mirror === domain) continue;
            const mirrorUrl = currentUrl.replace(domain, mirror);
            console.log(`[MovieScraper] Trying domain mirror: ${mirrorUrl}`);
            try {
                const reqHeaders = buildHeaders(mirrorUrl, parentUrl, 0);
                const res = await axios.get(mirrorUrl, {
                    headers: reqHeaders,
                    httpsAgent: browserHttpsAgent,
                    timeout: 10000,
                    validateStatus: (status) => status >= 200 && status < 400
                });
                const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                // Ensure mirror response is valid page content (contains atob/var url/reurl/download) and not a shopify dummy or error page
                const isValidContent = (body.includes('atob(') || body.includes('var url') || body.includes('reurl') || body.includes('download')) && !body.includes('shopify');
                if (isValidContent) {
                    console.log(`[MovieScraper] Mirror fetch succeeded: ${mirrorUrl}`);
                    return body;
                } else {
                    console.warn(`[MovieScraper] Mirror returned invalid or parked content: ${mirrorUrl}`);
                }
            } catch (err) {
                console.warn(`[MovieScraper] Mirror fetch failed for ${mirrorUrl}: ${err.message}`);
            }
        }
    }

    // Strategy 4: CORS/Proxy Fallback for 403 Cloudflare blocks
    console.log(`[MovieScraper] Trying proxy fallback for Cloudflare 403 on ${url}...`);
    const proxies = [
        `https://proxy.cors.sh/${url}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];

    for (const proxyUrl of proxies) {
        try {
            const res = await axios.get(proxyUrl, {
                headers: {
                    'User-Agent': USER_AGENTS[0],
                    'x-cors-api-key': 'temp_demo'
                },
                timeout: 15000
            });
            if (res.data && typeof res.data === 'string' && res.data.length > 200) {
                console.log(`[MovieScraper] Proxy fetch succeeded via ${proxyUrl.substring(0, 45)}...`);
                return res.data;
            }
        } catch (err) {
            console.warn(`[MovieScraper] Proxy fetch failed via ${proxyUrl.substring(0, 45)}: ${err.message}`);
        }
    }

    throw new Error(`Request failed with status code 403 (Cloudflare Block)`);
}

/**
 * Follow redirect chain using HEAD/GET requests to resolve final URL.
 * Used for 10Gbps server links that go through multiple redirects to googleusercontent.
 */
async function resolveFinalUrl(startUrl) {
    let currentUrl = startUrl;
    try {
        const res = await axios.get(startUrl, {
            headers: HEADERS,
            httpsAgent: browserHttpsAgent,
            timeout: 10000,
            maxRedirects: 10,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const finalUrl = res.request?.res?.responseUrl || res.config?.url || startUrl;
        console.log('[MovieScraper] 10Gbps final redirect landing URL:', finalUrl);

        if (finalUrl.includes('link=')) {
            const linkMatch = finalUrl.match(/link=([^&]+)/);
            if (linkMatch && linkMatch[1]) {
                const decoded = decodeURIComponent(linkMatch[1]);
                console.log('[MovieScraper] 10Gbps extracted direct link from URL param:', decoded);
                return decoded;
            }
        }

        const html = typeof res.data === 'string' ? res.data : '';
        if (html.includes('googleusercontent.com')) {
            const match = html.match(/https?:\/\/[^\s"']+\.googleusercontent\.com[^\s"']+/);
            if (match) {
                console.log('[MovieScraper] 10Gbps extracted direct link from HTML:', match[0]);
                return match[0];
            }
        }

        currentUrl = finalUrl;
    } catch (err) {
        console.warn(`[MovieScraper] resolveFinalUrl GET failed for ${startUrl}: ${err.message}`);
    }

    // Fallback: manual HEAD loop if GET did not resolve
    const maxRedirects = 7;
    for (let i = 0; i < maxRedirects; i++) {
        try {
            const res = await axios.head(currentUrl, {
                headers: HEADERS,
                httpsAgent: browserHttpsAgent,
                timeout: 5000,
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });
            const location = res.headers['location'];
            if (!location) break;
            currentUrl = location;
            if (currentUrl.includes('link=')) {
                const linkMatch = currentUrl.match(/link=([^&]+)/);
                if (linkMatch && linkMatch[1]) {
                    currentUrl = decodeURIComponent(linkMatch[1]);
                    break;
                }
            }
        } catch (err) {
            if (err.response && err.response.headers && err.response.headers['location']) {
                currentUrl = err.response.headers['location'];
                if (currentUrl.includes('link=')) {
                    const linkMatch = currentUrl.match(/link=([^&]+)/);
                    if (linkMatch && linkMatch[1]) {
                        currentUrl = decodeURIComponent(linkMatch[1]);
                        break;
                    }
                }
            } else {
                break;
            }
        }
    }
    return currentUrl;
}

/**
 * Clean up title by removing tags and year
 */
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/^download\s+/i, '')
        .replace(/\s*\(\s*season\s+.*?\)/gi, '')
        .replace(/\s*\(\s*\d{4}\s*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\b(480p|720p|1080p|2160p|dual|multi|hindi|english|dubbed|subbed|esub|org)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fetch movie/series metadata from TMDB using IMDb ID or search query
 */
async function fetchTmdbMetadata(query, mediaType = 'movie', imdbId = null) {
    try {
        let details = null;

        // 1. If IMDb ID is available, look it up directly
        if (imdbId && /^tt\d+$/.test(imdbId)) {
            const url = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&api_key=${TMDB_API_KEY}`;
            const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
            if (res.data) {
                const results = res.data.movie_results || [];
                const tvResults = res.data.tv_results || [];
                if (results.length > 0) {
                    details = { ...results[0], media_type: 'movie' };
                } else if (tvResults.length > 0) {
                    details = { ...tvResults[0], media_type: 'tv' };
                }
            }
        }

        // 2. Fallback to keyword search
        if (!details && query) {
            const cleanQuery = cleanTitle(query);
            const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(cleanQuery)}&api_key=${TMDB_API_KEY}`;
            const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
            if (res.data && res.data.results && res.data.results.length > 0) {
                details = res.data.results.find(r => r.media_type === 'movie' || r.media_type === 'tv');
            }
        }

        if (!details) return null;

        const isTv = details.media_type === 'tv';
        const tmdbId = details.id;
        const title = details.title || details.name || '';
        const overview = details.overview || '';
        const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/w500${details.backdrop_path}` : null;
        const releaseDate = details.release_date || details.first_air_date || '';
        const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
        const genres = details.genre_ids ? details.genre_ids.map(id => getGenreName(id)).filter(Boolean).join(', ') : 'Unknown';

        return {
            tmdbId,
            title,
            year,
            overview,
            genres,
            posterUrl,
            backdropUrl,
            type: details.media_type,
            releaseDate
        };
    } catch (err) {
        console.error('[MovieScraper] TMDB fetch failed:', err.message);
        return null;
    }
}

/**
 * Fetch YouTube trailer URL for a TMDB ID with Season support (strict TMDB only)
 */
async function fetchTmdbTrailerUrl(tmdbId, mediaType = 'movie', title = '', seasonNumber = null) {
    try {
        let ytVideos = [];

        // 1. Try Season-level videos first if season specified for TV
        if (mediaType === 'tv' && seasonNumber !== null && seasonNumber !== undefined) {
            try {
                const sUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}/videos?api_key=${TMDB_API_KEY}`;
                const sRes = await axios.get(sUrl, { headers: HEADERS, timeout: 5000 });
                if (sRes.data && sRes.data.results) {
                    ytVideos.push(...sRes.data.results.filter(v => v.site === 'YouTube' && v.key));
                }
            } catch (_) {}
        }

        // 2. Try Series/Movie-level videos
        try {
            const mUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${TMDB_API_KEY}`;
            const mRes = await axios.get(mUrl, { headers: HEADERS, timeout: 5000 });
            if (mRes.data && mRes.data.results) {
                ytVideos.push(...mRes.data.results.filter(v => v.site === 'YouTube' && v.key));
            }
        } catch (_) {}

        if (ytVideos.length > 0) {
            let chosen = ytVideos.find(v => v.type === 'Trailer' && v.official);
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Trailer');
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Teaser' && v.official);
            if (!chosen) chosen = ytVideos.find(v => v.type === 'Teaser');
            if (!chosen) chosen = ytVideos[0];

            if (chosen) {
                return `https://www.youtube.com/watch?v=${chosen.key}`;
            }
        }

        return null;
    } catch (err) {
        console.error('[MovieScraper] TMDB trailer fetch failed:', err.message);
        return null;
    }
}

/**
 * Fetch movie/series metadata from TMDB using a specific TMDB ID
 */
async function fetchTmdbById(tmdbId, mediaType = 'movie', seasonNumber = null) {
    try {
        const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
        if (!res.data) return null;

        const details = res.data;
        const title = details.title || details.name || '';
        const overview = details.overview || '';
        const posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
        const backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/w500${details.backdrop_path}` : null;
        const releaseDate = details.release_date || details.first_air_date || '';
        const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
        const genres = details.genres ? details.genres.map(g => g.name).join(', ') : 'Unknown';
        const trailerUrl = await fetchTmdbTrailerUrl(tmdbId, mediaType, title, seasonNumber);

        return {
            tmdbId,
            title,
            year,
            overview,
            genres,
            posterUrl,
            backdropUrl,
            trailerUrl,
            type: mediaType,
            releaseDate,
            seasons: details.seasons || [],
            numberOfSeasons: details.number_of_seasons || 0,
            numberOfEpisodes: details.number_of_episodes || 0
        };
    } catch (err) {
        console.error('[MovieScraper] TMDB fetch by ID failed:', err.message);
        return null;
    }
}

/**
 * Download direct YouTube video URL using cnv.cx engine
 */
async function downloadYoutubeVideoUrl(ytUrl, quality = '720', format = 'mp4') {
    const customHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Referer': 'https://frame.y2meta-uk.com/',
        'Origin': 'https://frame.y2meta-uk.com',
        'Accept': '*/*'
    };

    try {
        let videoId = '';
        const match = (ytUrl || '').match(/(?:v=|\/embed\/|\/v\/|\/shorts\/|youtu\.be\/|\/v=|^)([a-zA-Z0-9_-]{11})/);
        if (match) {
            videoId = match[1];
        }

        console.log(`[MovieScraper] Requesting cnv.cx API key for video ID: ${videoId || ytUrl}...`);
        const keyUrl = videoId ? `https://cnv.cx/v2/sanity/key?id=${videoId}` : 'https://cnv.cx/v2/sanity/key';
        const keyRes = await axios.get(keyUrl, { headers: customHeaders, timeout: 25000 });
        if (!keyRes.data || !keyRes.data.key) throw new Error('Key fetch failed');
        const apiKey = keyRes.data.key;

        const params = new URLSearchParams({
            id: videoId || ytUrl,
            link: `https://www.youtube.com/watch?v=${videoId || ytUrl}`,
            format: format,
            audioBitrate: '128',
            videoQuality: quality,
            filenameStyle: 'pretty',
            vCodec: 'h264'
        });

        console.log('[MovieScraper] Converting YouTube video URL...');
        const convUrl = videoId ? `https://cnv.cx/v2/converter?id=${videoId}` : 'https://cnv.cx/v2/converter';
        const convRes = await axios.post(convUrl, params.toString(), {
            headers: {
                ...customHeaders,
                'Content-Type': 'application/x-www-form-urlencoded',
                'key': apiKey
            },
            timeout: 25000
        });

        if (convRes.data && convRes.data.url) {
            console.log('[MovieScraper] Direct YouTube video URL resolved:', convRes.data.url);
            return convRes.data.url;
        }
        return null;
    } catch (err) {
        console.error('[MovieScraper] cnv.cx YouTube video resolution failed:', err.message);
        return null;
    }
}



function getGenreName(id) {
    const genreMap = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
        99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
        27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
        10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure',
        10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
        10767: 'Talk', 10768: 'War & Politics'
    };
    return genreMap[id] || null;
}

/**
 * Scrape a post page on Vegamovies, Rogmovies, or HDHub4u
 */
async function scrapePostPage(url) {
    try {
        const html = await fetchHtmlWithRetry(url);
        const $ = cheerio.load(html);

        // 1. Find IMDb URL/ID
        let imdbId = null;
        const imdbLink = $('a[href*="imdb.com/title/tt"]').attr('href');
        if (imdbLink) {
            const match = imdbLink.match(/tt\d+/);
            if (match) imdbId = match[0];
        }

        // 2. Parse title and metadata
        const rawTitle = $('title').text() || $('h1').text() || '';
        const cleanName = cleanTitle(rawTitle);

        let season = null;
        let episode = null;
        const sMatch = rawTitle.match(/season\s*(\d+)/i) || rawTitle.match(/\bs(\d+)\b/i);
        const eMatch = rawTitle.match(/episode\s*(\d+)/i) || rawTitle.match(/\be(\d+)\b/i);
        if (sMatch) season = parseInt(sMatch[1], 10);
        if (eMatch) episode = parseInt(eMatch[1], 10);

        // 3. Find download links grouped by resolution inside the page content body
        const links = [];
        const contentSelector = 'main.page-body, .page-body, .entry-content, #main-content';
        
        $(contentSelector).find('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const linkText = $(el).text().trim();

            if (!href || href.trim() === '/' || href.startsWith('#') || href.includes('imdb.com') || href.includes('youtube.com') || href.includes('telegram') || href.includes('facebook') || href.includes('twitter')) {
                return;
            }

            const lowerHref = href.toLowerCase();
            if (lowerHref.includes('/category/') || lowerHref.includes('/tag/') || lowerHref.includes('/genre/') || lowerHref.includes('?s=') || lowerHref.includes('/author/')) {
                return;
            }

            // Exclude internal domain links unless it's a direct landing/download link
            try {
                const parsedUrl = new URL(url);
                if (href.includes(parsedUrl.hostname) && !lowerHref.includes('/download') && !lowerHref.includes('nexdrive') && !lowerHref.includes('fastdl')) {
                    return;
                }
            } catch (e) {}

            // Must contain download keywords or wrap a button element
            const hasButton = $(el).find('button, .dwd-button, .btn').length > 0 || $(el).hasClass('btn') || $(el).hasClass('dwd-button');
            const hasDwdKeyword = linkText.toLowerCase().includes('download') || 
                                 linkText.toLowerCase().includes('click here') || 
                                 linkText.toLowerCase().includes('v-cloud') || 
                                 linkText.toLowerCase().includes('g-direct') ||
                                 lowerHref.includes('nexdrive') || 
                                 lowerHref.includes('vgmlink') || 
                                 lowerHref.includes('gdflix') || 
                                 lowerHref.includes('fastdl') || 
                                 lowerHref.includes('filebee');

            if (!hasButton && !hasDwdKeyword) {
                return;
            }

            let precedingHeading = '';
            let prev = $(el).closest('p, div').prev();
            while (prev.length && !/^h[1-6]$/i.test(prev[0].name)) {
                prev = prev.prev();
            }
            if (prev.length) {
                precedingHeading = prev.text();
            }

            const combinedText = `${linkText} ${precedingHeading}`.toLowerCase();
            let resolution = 'Unknown';
            if (combinedText.includes('2160p') || combinedText.includes('4k')) {
                resolution = '2160p';
            } else if (combinedText.includes('1080p')) {
                resolution = '1080p';
            } else if (combinedText.includes('720p')) {
                resolution = '720p';
            } else if (combinedText.includes('480p')) {
                resolution = '480p';
            }

            links.push({ text: linkText, href, resolution });
        });

        // Prioritize: 720p first, then 480p, then 1080p, then any link
        let chosenLink = links.find(l => l.resolution === '720p');
        if (!chosenLink) chosenLink = links.find(l => l.resolution === '480p');
        if (!chosenLink) chosenLink = links.find(l => l.resolution === '1080p');
        if (!chosenLink) chosenLink = links[0];

        if (!chosenLink) {
            throw new Error('No download links found in post body.');
        }

        return {
            title: cleanName,
            imdbId,
            season,
            episode,
            chosenUrl: chosenLink.href,
            resolution: chosenLink.resolution
        };
    } catch (err) {
        console.error('[MovieScraper] Post page scrape failed:', err.message);
        throw err;
    }
}

/**
 * Follow shorteners or redirects to get the VCloud/HubCloud link
 */
async function resolveLandingLink(url, parentUrl = null) {
    try {
        let currentUrl = url;
        console.log('[MovieScraper] Resolving landing link:', currentUrl);

        const html = await fetchHtmlWithRetry(currentUrl, parentUrl);
        const $ = cheerio.load(html);

        // Keywords for final hosts (exclude landing domains like nexdrive/vgmlink/gdflix if we are already on them)
        const currentDomain = new URL(currentUrl).hostname.toLowerCase();
        const keywords = ['vcloud', 'hubcloud', 'gdflix', 'katdrive', 'kmhd', 'vgmlink', 'fastdl', 'filebee', 'nexdrive']
            .filter(kw => !currentDomain.includes(kw));
        
        let resolvedUrl = null;
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && keywords.some(kw => href.toLowerCase().includes(kw))) {
                if (!href.includes('/category/') && !href.includes('/tag/') && !href.includes('?s=')) {
                    resolvedUrl = href;
                    return false;
                }
            }
        });

        if (resolvedUrl) {
            console.log('[MovieScraper] Found intermediate link on landing page:', resolvedUrl);
            return resolvedUrl;
        }

        return currentUrl;
    } catch (err) {
        console.error('[MovieScraper] Landing link resolution failed:', err.message);
        return url;
    }
}

/**
 * Extract direct download links from V-Cloud / HubCloud / Fastdl / Filebee pages
 */
async function resolveVcloudLink(url, preferredServer = null, parentUrl = null) {
    try {
        console.log('[MovieScraper] Resolving V-Cloud/HubCloud link:', url);

        // Remote VCloud Server (your PC via cloudflared tunnel) — highest priority
        const vcloudServer = process.env.VCLOUD_SERVER;
        const vcloudSecret = process.env.VCLOUD_SECRET || 'danie2026';
        if (vcloudServer) {
            try {
                console.log(`[MovieScraper] Trying remote VCloud server: ${vcloudServer}`);
                const remoteRes = await axios.get(`${vcloudServer}/resolve`, {
                    params: { url, key: vcloudSecret },
                    timeout: 15000
                });
                if (remoteRes.data && remoteRes.data.success && remoteRes.data.directUrl) {
                    console.log(`[MovieScraper] Remote VCloud server resolved: ${remoteRes.data.directUrl}`);
                    return remoteRes.data.directUrl;
                }
            } catch (remoteErr) {
                console.warn(`[MovieScraper] Remote VCloud server failed: ${remoteErr.message}`);
            }
        }

        // Handle Pixeldrain links directly
        if (url.includes('pixeldrain') && url.includes('/u/')) {
            const id = url.split('/u/')[1].split('?')[0];
            const direct = `https://pixeldrain.com/api/file/${id}?download`;
            console.log('[MovieScraper] Resolved direct Pixeldrain link:', direct);
            return direct;
        }

        // 1. Handle Filebee links directly
        if (url.includes('filebee.xyz')) {
            const html = await fetchHtmlWithRetry(url, parentUrl);
            const $ = cheerio.load(html);
            const dlLink = $('a[href*="cdn-cgi/content"], a[href*="filepress"]').attr('href');
            if (dlLink) {
                console.log('[MovieScraper] Resolved direct Filebee link:', dlLink);
                return dlLink;
            }
        }

        // 2. Handle Fastdl direct link redirection
        if (url.includes('fastdl.zip')) {
            const scriptContent = await fetchHtmlWithRetry(url, parentUrl);
            const reurlRegex = /reurl\s*=\s*['"]([^'"]+)['"]/i;
            const match = reurlRegex.exec(scriptContent);
            if (match && match[1]) {
                const reurl = match[1];
                try {
                    const parsedUrl = new URL(reurl);
                    const linkParam = parsedUrl.searchParams.get('link');
                    if (linkParam) {
                        console.log('[MovieScraper] Resolved direct Google User Content link from Fastdl:', linkParam);
                        return linkParam;
                    }
                } catch (e) {}
                console.log('[MovieScraper] Resolved Fastdl target:', reurl);
                return reurl;
            }
        }

        const html = await fetchHtmlWithRetry(url, parentUrl);
        const $ = cheerio.load(html);

        // 3. Look for inline JavaScript double base64 atob encoding or var url = '...'
        const scriptContent = $('script').text() || '';
        let decodedLink = null;

        const atobRegex = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
        let match = atobRegex.exec(scriptContent);
        if (match && match[1]) {
            try {
                const step1 = Buffer.from(match[1], 'base64').toString('utf8');
                decodedLink = Buffer.from(step1, 'base64').toString('utf8');
                console.log('[MovieScraper] Decoded double-atob link:', decodedLink);
            } catch (e) {
                console.error('[MovieScraper] Failed decoding double atob:', e.message);
            }
        }

        if (!decodedLink) {
            const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
            const matchVar = varUrlRegex.exec(scriptContent);
            if (matchVar && matchVar[1]) {
                decodedLink = matchVar[1];
                console.log('[MovieScraper] Decoded var url link:', decodedLink);
            }
        }

        if (!decodedLink && url.includes('/video/')) {
            const videoDl = $('div.vd > center > a').attr('href');
            if (videoDl) {
                decodedLink = videoDl;
            }
        }

        if (decodedLink) {
            if (!decodedLink.startsWith('http')) {
                const parsed = new URL(url);
                decodedLink = `${parsed.protocol}//${parsed.host}${decodedLink.startsWith('/') ? '' : '/'}${decodedLink}`;
            }

            console.log('[MovieScraper] Fetching final download landing page:', decodedLink);
            const dlHtml = await fetchHtmlWithRetry(decodedLink, url);
            const dl$ = cheerio.load(dlHtml);

            const finalLinks = [];
            dl$('h2 a.btn, div.card-body a.btn, a.btn, a[href]').each((_, el) => {
                const href = dl$(el).attr('href');
                const text = dl$(el).text().trim();
                if (href && (href.startsWith('http') || href.startsWith('/'))) {
                    finalLinks.push({ text, href });
                }
            });

            // Strict server prioritization fallback: 10gbps > fslv2 > fsl (ONLY)
            let best = null;
            if (preferredServer) {
                const lowerPref = preferredServer.toLowerCase();
                let cleanPref = lowerPref;
                const matchBrackets = lowerPref.match(/\[(.*?)\]/);
                if (matchBrackets && matchBrackets[1]) {
                    cleanPref = matchBrackets[1];
                }
                best = finalLinks.find(l => {
                    const txt = l.text.toLowerCase();
                    return txt.includes(cleanPref) || cleanPref.includes(txt);
                });
            }

            // Priority 1: 10Gbps Server
            if (!best) {
                best = finalLinks.find(l => {
                    const txt = `${l.text} ${l.href}`.toLowerCase();
                    return txt.includes('10gbps') || txt.includes('10 gbps') || txt.includes('g-direct') || txt.includes('gdirect');
                });
            }

            // Priority 2: FSLv2 Server
            if (!best) {
                best = finalLinks.find(l => {
                    const txt = `${l.text} ${l.href}`.toLowerCase();
                    return txt.includes('fslv2') || txt.includes('fsl v2') || txt.includes('fsl-v2');
                });
            }

            // Priority 3: FSL Server (excluding FSLv2)
            if (!best) {
                best = finalLinks.find(l => {
                    const txt = `${l.text} ${l.href}`.toLowerCase();
                    return (txt.includes('fsl') || txt.includes('fsl server') || txt.includes('fastserver')) && !txt.includes('fslv2') && !txt.includes('fsl v2') && !txt.includes('fsl-v2');
                });
            }

            if (!best) {
                throw new Error('No compatible download server found. Only 10Gbps, FSLv2, and FSL servers are supported.');
            }

            if (best) {
                let directUrl = best.href;
                const bestText = best.text.toLowerCase();
                if (!directUrl.startsWith('http')) {
                    const parsed = new URL(decodedLink);
                    directUrl = `${parsed.protocol}//${parsed.host}${directUrl.startsWith('/') ? '' : '/'}${directUrl}`;
                }

                // Server-specific resolution (from CSX/VegaMovies reference)
                if (bestText.includes('10gbps') || bestText.includes('10 gbps')) {
                    // 10Gbps: Follow redirect chain, extract link= parameter
                    console.log('[MovieScraper] Resolving 10Gbps server via redirect chain:', directUrl);
                    try {
                        let redirectUrl = await resolveFinalUrl(directUrl);
                        if (redirectUrl && redirectUrl.includes('link=')) {
                            redirectUrl = redirectUrl.split('link=')[1];
                            if (redirectUrl.includes('&')) redirectUrl = redirectUrl.split('&')[0];
                            redirectUrl = decodeURIComponent(redirectUrl);
                        }
                        directUrl = redirectUrl || directUrl;
                    } catch (e) {
                        console.error('[MovieScraper] 10Gbps redirect resolution failed:', e.message);
                    }
                } else if (bestText.includes('buzzserver')) {
                    // BuzzServer: GET {link}/download with referer, extract hx-redirect header
                    console.log('[MovieScraper] Resolving BuzzServer link:', directUrl);
                    try {
                        const buzzRes = await axios.get(`${directUrl}/download`, {
                            headers: { ...HEADERS, 'Referer': directUrl },
                            httpsAgent: browserHttpsAgent,
                            maxRedirects: 0,
                            timeout: 15000,
                            validateStatus: (status) => status >= 200 && status < 400
                        });
                        const hxRedirect = buzzRes.headers['hx-redirect'];
                        if (hxRedirect) {
                            const buzzBase = new URL(directUrl);
                            directUrl = hxRedirect.startsWith('http') ? hxRedirect : `${buzzBase.protocol}//${buzzBase.host}${hxRedirect}`;
                        }
                    } catch (e) {
                        if (e.response && e.response.headers && e.response.headers['hx-redirect']) {
                            const hxRedirect = e.response.headers['hx-redirect'];
                            const buzzBase = new URL(directUrl);
                            directUrl = hxRedirect.startsWith('http') ? hxRedirect : `${buzzBase.protocol}//${buzzBase.host}${hxRedirect}`;
                        } else {
                            console.error('[MovieScraper] BuzzServer resolution failed:', e.message);
                        }
                    }
                } else if (directUrl.includes('pixeldrain') && directUrl.includes('/u/')) {
                    const id = directUrl.split('/u/')[1].split('?')[0];
                    directUrl = `https://pixeldrain.com/api/file/${id}?download`;
                }

                console.log('[MovieScraper] Resolved final direct URL:', directUrl);
                return directUrl;
            }
        }

        const directBtn = $('a:contains("Download File")').attr('href') || $('a:contains("FSL Server")').attr('href');
        if (directBtn) {
            return directBtn;
        }

        throw new Error(`Could not extract direct download URL from V-Cloud page (${url}).`);
    } catch (err) {
        console.error('[MovieScraper] V-Cloud resolution failed:', err.message);
        throw err;
    }
}

/**
 * Scrape all download links on a Vegamovies/Rogmovies/HDHub4u post page
 */
async function scrapeAllPostLinks(url) {
    try {
        const html = await fetchHtmlWithRetry(url);
        const $ = cheerio.load(html);
        const pageTitle = $('title').text() || $('h1').text() || '';
        const isSeries = /season|episode|series|vol/i.test(pageTitle);

        const links = [];
        const contentSelector = 'main.page-body, .page-body, .entry-content, #main-content, div.content-kuss, div.content-area';

        $(contentSelector).find('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const linkText = $(el).text().trim();

            if (!href || href.trim() === '/' || href.startsWith('#') || href.includes('imdb.com') || href.includes('youtube.com') || href.includes('telegram') || href.includes('facebook') || href.includes('twitter') || href.includes('/how-to-download/')) {
                return;
            }

            const lowerHref = href.toLowerCase();
            if (lowerHref.includes('/category/') || lowerHref.includes('/tag/') || lowerHref.includes('/genre/') || lowerHref.includes('?s=') || lowerHref.includes('/author/')) {
                return;
            }

            // Exclude internal domain links / related posts unless they point to a download landing page
            try {
                const parsedUrl = new URL(url);
                const isInternalPost = href.includes(parsedUrl.hostname) || href.startsWith('/download-') || href.startsWith('/movies-') || href.startsWith('/anime-');
                const isLandingUrl = lowerHref.includes('/download/') || lowerHref.includes('nexdrive') || lowerHref.includes('fastdl') || lowerHref.includes('vgmlink') || lowerHref.includes('gdflix') || lowerHref.includes('hubcloud') || lowerHref.includes('vcloud') || lowerHref.includes('hubdrive') || lowerHref.includes('filebee') || lowerHref.includes('katdrive') || lowerHref.includes('kmhd');
                if (isInternalPost && !isLandingUrl) {
                    return;
                }
            } catch (e) {}

            const isHostLink = lowerHref.includes('hubdrive') || lowerHref.includes('hubcdn') || lowerHref.includes('hubcloud') || lowerHref.includes('vcloud') || lowerHref.includes('gadgetsweb') || lowerHref.includes('fastdl') || lowerHref.includes('filebee') || lowerHref.includes('nexdrive') || lowerHref.includes('vgmlink') || lowerHref.includes('gdflix') || lowerHref.includes('katdrive') || lowerHref.includes('kmhd');
            const hasButton = $(el).find('button, .dwd-button, .btn').length > 0 || $(el).hasClass('btn') || $(el).hasClass('dwd-button');
            const hasDwdKeyword = isHostLink ||
                                 linkText.toLowerCase().includes('download') || 
                                 linkText.toLowerCase().includes('click here') || 
                                 linkText.toLowerCase().includes('v-cloud') || 
                                 linkText.toLowerCase().includes('g-direct') ||
                                 linkText.toLowerCase().includes('drive') ||
                                 linkText.toLowerCase().includes('instant') ||
                                 linkText.toLowerCase().includes('episode');

            if (!hasButton && !hasDwdKeyword) {
                return;
            }

            // Filter out Pack/Zip links for TV Series per user requirement
            const isPack = /\bpack\b|\bbatch\b|\bzip\b|\ball\s+episodes\b/i.test(linkText) || /\bpack\b|\bzip\b|\bbatch\b/i.test(lowerHref);
            if (isSeries && isPack) {
                return;
            }

            const parentText = $(el).parent().text().trim();

            let precedingHeading = '';
            let curr = $(el).closest('p, div, h4, h3, h2');
            let count = 0;
            while (curr.length && count < 5 && !precedingHeading) {
                let sib = curr.prev();
                while (sib.length) {
                    const text = sib.text().trim();
                    if (text && (text.includes('720p') || text.includes('1080p') || text.includes('480p') || text.includes('2160p') || text.includes('4K') || /^h[1-6]$/i.test(sib[0].name))) {
                        if (!text.toLowerCase().includes('how to download')) {
                            precedingHeading = text.substring(0, 100);
                            break;
                        }
                    }
                    sib = sib.prev();
                }
                curr = curr.parent();
                count++;
            }

            const combinedText = `${linkText} ${parentText} ${precedingHeading}`.toLowerCase();

            // Determine episode number from parent or link text
            let episode = null;
            const epMatch = parentText.match(/\b(?:E|EP|Episode)\s*[:\-–—]?\s*(\d+)\b/i) || linkText.match(/\b(?:E|EP|Episode)\s*[:\-–—]?\s*(\d+)\b/i);
            if (epMatch) {
                const epNum = parseInt(epMatch[1], 10);
                episode = `E${String(epNum).padStart(2, '0')}`;
            }

            let resolution = 'Unknown';
            if (combinedText.includes('2160p') || combinedText.includes('4k')) {
                resolution = '2160p';
            } else if (combinedText.includes('1080p')) {
                resolution = '1080p';
            } else if (combinedText.includes('720p')) {
                resolution = '720p';
            } else if (combinedText.includes('480p')) {
                resolution = '480p';
            }

            if (resolution === 'Unknown' && !episode && !isHostLink) return;

            links.push({ text: linkText, href, resolution, episode, heading: precedingHeading.trim(), parentText });
        });

        return links;
    } catch (err) {
        console.error('[MovieScraper] scrapeAllPostLinks failed:', err.message);
        throw err;
    }
}

/**
 * Helper to find episode text from preceding headings or surrounding elements
 */
function findEpisodeText($, el, pageTitle) {
    let seasonPrefix = '';
    if (pageTitle) {
        const seasonMatch = pageTitle.match(/\((S\d+)\)/i) || pageTitle.match(/Season\s*(\d+)/i) || pageTitle.match(/\bs(\d+)\b/i);
        if (seasonMatch) {
            const matchedVal = seasonMatch[1] || seasonMatch[0];
            if (/^S\d+/i.test(matchedVal)) {
                seasonPrefix = matchedVal.toUpperCase();
            } else {
                const num = parseInt(matchedVal.replace(/\D/g, ''), 10);
                if (!isNaN(num)) {
                    seasonPrefix = `S${String(num).padStart(2, '0')}`;
                }
            }
        }
    }

    // --- Helper: try to parse an episode range or single number from text ---
    // Matches patterns like: "Episodes: 12 + 15", "Episode: 1 + 07", "Episodes 8 - 11"
    const rangeRegex = /episode[s]?\s*[:\s]\s*(\d+)\s*[\+\-–—]\s*(\d+)/i;
    // Matches single: "Episode: 12", "Episode 5", "E01", "EP01", "S01E01"
    const singleRegex = /episode[s]?\s*[:\s]\s*(\d+)/i;

    function parseEpisodeFromText(text) {
        if (!text) return null;
        const sMatch = text.match(/\bS(\d+)\s*E(\d+)\b/i);
        if (sMatch) {
            const sNum = parseInt(sMatch[1], 10);
            const eNum = parseInt(sMatch[2], 10);
            return { type: 'single', label: `S${String(sNum).padStart(2, '0')}E${String(eNum).padStart(2, '0')}` };
        }
        const epMatch = text.match(/\b(?:E|EP|Episode)\s*[:\-–—]?\s*(\d+)\b/i);
        if (epMatch) {
            const epNum = parseInt(epMatch[1], 10);
            const epStr = `E${String(epNum).padStart(2, '0')}`;
            return { type: 'single', label: seasonPrefix ? `${seasonPrefix}${epStr}` : `Episode ${epNum}` };
        }
        const rangeMatch = text.match(rangeRegex);
        if (rangeMatch) {
            const startEp = parseInt(rangeMatch[1], 10);
            const endEp = parseInt(rangeMatch[2], 10);
            const startStr = `E${String(startEp).padStart(2, '0')}`;
            const endStr = `E${String(endEp).padStart(2, '0')}`;
            return { type: 'range', label: seasonPrefix ? `${seasonPrefix}${startStr}-${endStr}` : `Episode ${startEp}-${endEp}` };
        }
        const singleMatch = text.match(singleRegex);
        if (singleMatch) {
            const epNum = parseInt(singleMatch[1], 10);
            const epStr = `E${String(epNum).padStart(2, '0')}`;
            return { type: 'single', label: seasonPrefix ? `${seasonPrefix}${epStr}` : `Episode ${epNum}` };
        }
        return null;
    }

    // 1. Check the element's own text and parent text
    const selfText = ($(el).text().trim() + ' ' + $(el).parent().text().trim());
    const selfResult = parseEpisodeFromText(selfText);
    if (selfResult) return selfResult.label;

    // 2. Check table row context
    const row = $(el).closest('tr');
    if (row.length) {
        const firstTd = row.find('td').first().text().trim();
        const rowResult = parseEpisodeFromText(firstTd);
        if (rowResult) return rowResult.label;
        // Fallback: bare number in table cell
        if (/^\d+$/.test(firstTd)) {
            const epNum = parseInt(firstTd, 10);
            const epStr = `E${String(epNum).padStart(2, '0')}`;
            return seasonPrefix ? `${seasonPrefix}${epStr}` : `Episode ${epNum}`;
        }
    }

    // 3. Walk preceding siblings to find episode heading
    let curr = $(el).closest('p, div, td, tr, li');
    let found = false;
    let episodeText = '';
    while (curr.length && !found) {
        let sib = curr.prev();
        while (sib.length) {
            const name = sib[0].name.toLowerCase();
            const sibText = sib.text().trim();
            if (/^h[1-6]$/.test(name) || (name === 'p' && sibText.toLowerCase().includes('episode'))) {
                if (sibText) {
                    episodeText = sibText;
                    found = true;
                    break;
                }
            }
            sib = sib.prev();
        }
        curr = curr.parent();
    }

    if (episodeText) {
        const headingResult = parseEpisodeFromText(episodeText);
        if (headingResult) return headingResult.label;

        // Fallback: clean non-standard text
        const cleanText = episodeText.replace(/^[-:\s]+|[-:\s]+$/g, '').trim();
        const matchNum = cleanText.match(/\b(\d+)\b/);
        if (matchNum) {
            const epNum = parseInt(matchNum[1], 10);
            const epStr = `E${String(epNum).padStart(2, '0')}`;
            return seasonPrefix ? `${seasonPrefix}${epStr}` : `Episode ${epNum}`;
        }
        return seasonPrefix ? `${seasonPrefix} - ${cleanText}` : cleanText;
    }

    return seasonPrefix ? `${seasonPrefix}` : '';
}

/**
 * Follow redirects and extract all available direct download buttons/links (FSL, GDrive, PixelDrain, Mega, etc.) from the landing page
 */
async function extractDirectDownloadLinks(url, parentUrl = null) {
    try {
        console.log('[MovieScraper] Fetching landing page to extract hosts:', url);
        const html = await fetchHtmlWithRetry(url, parentUrl);
        const $ = cheerio.load(html);
        
        const pageTitle = $('title').text() || $('h1').text() || '';
        
        const hosts = [];
        const keywords = ['fastdl', 'vcloud', 'filebee', 'gofile', 'vikingfile', 'megaup', 'gdflix', 'katdrive', 'kmhd', 'hubcloud', 'pixeldrain', 'drive.google', 'mega.nz', 'yodrive', 'shared'];
        
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            let text = $(el).text().trim().replace(/\s+/g, ' ');
            if (!href) return;
            
            const lowerHref = href.toLowerCase();
            const lowerText = text.toLowerCase();
            
            // Check if the link points to a download host or contains download keywords
            const isHostLink = keywords.some(kw => lowerHref.includes(kw));
            const isDownloadBtn = lowerText.includes('download') || lowerText.includes('direct') || lowerText.includes('drive') || lowerText.includes('server') || lowerText.includes('cloud');
            
            if (isHostLink || isDownloadBtn) {
                // Exclude category, tag, etc.
                if (lowerHref.includes('/category/') || lowerHref.includes('/tag/') || lowerHref.includes('/genre/') || lowerHref.includes('?s=')) {
                    return;
                }
                // Exclude logo/home links
                if (href === '/' || (href.includes('nexdrive.fit') && !lowerHref.includes('/download') && !lowerHref.includes('?'))) {
                    return;
                }
                
                // Clean up text if it is just a URL
                if (text.startsWith('http')) {
                    try {
                        const parsed = new URL(text);
                        text = parsed.hostname;
                    } catch(e) {}
                }
                
                const episodeText = findEpisodeText($, el, pageTitle);
                
                // Avoid duplicates
                if (!hosts.some(h => h.href === href)) {
                    hosts.push({ 
                        text: text || 'Download Link', 
                        href,
                        episode: episodeText || undefined
                    });
                }
            }
        });
        
        if (hosts.length > 0) {
            return hosts;
        }
        
        // Fallback to resolving the first landing link if we didn't find any direct links
        let landingUrl = await resolveLandingLink(url, parentUrl);
        return [{ text: 'Default Download Link', href: landingUrl }];
    } catch (err) {
        console.error('[MovieScraper] extractDirectDownloadLinks failed:', err.message);
        return [{ text: 'Original Landing Link', href: url }];
    }
}

/**
 * Extract direct download URLs for Gofile.io links using official Gofile API
 */
async function extractGofileDirectLink(url) {
    try {
        const contentIdMatch = url.match(/\/d\/([a-zA-Z0-9]+)/);
        if (!contentIdMatch) return [];
        const contentId = contentIdMatch[1];

        console.log(`[MovieScraper] Extracting Gofile direct links for contentId: ${contentId}`);

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Origin': 'https://gofile.io',
            'Referer': `https://gofile.io/d/${contentId}`
        };

        // 1. Get wt parameter from config.js
        let wt = '4fd6sg89d7s6';
        try {
            const configRes = await axios.get('https://gofile.io/dist/js/config.js', { headers, timeout: 5000 });
            const wtMatch = configRes.data.match(/wt\s*=\s*['"]([^'"]+)['"]/);
            if (wtMatch && wtMatch[1]) wt = wtMatch[1];
        } catch (_) {}

        // 2. Create guest account token
        let token = '';
        try {
            const accRes = await axios.post('https://api.gofile.io/accounts', {}, { headers, timeout: 8000 });
            token = accRes.data?.data?.token || '';
        } catch (_) {}

        const reqHeaders = {
            ...headers,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };

        // 3. Fetch folder contents
        const contentUrl = `https://api.gofile.io/contents/${contentId}?wt=${wt}`;
        const res = await axios.get(contentUrl, { headers: reqHeaders, timeout: 10000 });

        if (res.data && res.data.status === 'ok' && res.data.data && res.data.data.children) {
            const children = res.data.data.children;
            const links = [];
            Object.values(children).forEach(item => {
                const directUrl = item.link || (item.server && item.name ? `https://${item.server}.gofile.io/download/web/${item.id || item.name}/${encodeURIComponent(item.name)}` : null);
                if (directUrl) {
                    links.push({
                        text: item.name || 'Gofile Direct Link',
                        href: directUrl
                    });
                }
            });
            if (links.length > 0) return links;
        } else if (res.data && res.data.status === 'error-notPremium') {
            console.warn(`[MovieScraper] Gofile folder ${contentId} requires Premium account`);
        }
    } catch (err) {
        console.error('[MovieScraper] extractGofileDirectLink failed:', err.message);
    }
    return [];
}

/**
 * Scrapes a landing/redirect page (vcloud.zip, gdflix, fastdl, filebee, hubcloud)
 * and extracts all sub-options (like FSL Server, FSLv2, GDrive, PixelDrain, etc.)
 */
async function extractSubOptions(url, parentUrl = null) {
    try {
        console.log('[MovieScraper] Extracting sub-options from:', url);

        // Remote VCloud Server (your PC via cloudflared tunnel) — highest priority
        const vcloudServer = process.env.VCLOUD_SERVER;
        const vcloudSecret = process.env.VCLOUD_SECRET || 'danie2026';
        if (vcloudServer) {
            try {
                console.log(`[MovieScraper] Trying remote VCloud server for sub-options: ${vcloudServer}`);
                const remoteRes = await axios.get(`${vcloudServer}/suboptions`, {
                    params: { url, key: vcloudSecret },
                    timeout: 15000
                });
                if (remoteRes.data && remoteRes.data.success && remoteRes.data.subOptions && remoteRes.data.subOptions.length > 0) {
                    console.log(`[MovieScraper] Remote VCloud server returned ${remoteRes.data.subOptions.length} sub-options`);
                    return remoteRes.data.subOptions;
                }
            } catch (remoteErr) {
                console.warn(`[MovieScraper] Remote VCloud server sub-options failed: ${remoteErr.message}`);
            }
        }

        // 1. Handle Filebee links directly
        if (url.includes('filebee.xyz')) {
            const html = await fetchHtmlWithRetry(url, parentUrl);
            const $ = cheerio.load(html);
            const finalLinks = [];
            $('a[href*="cdn-cgi/content"], a[href*="filepress"]').each((_, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim() || 'Filebee Direct Link';
                if (href) finalLinks.push({ text, href });
            });
            if (finalLinks.length > 0) return finalLinks;
        }

        // 2. Handle Gofile.io links directly via API
        if (url.includes('gofile.io')) {
            const gofileLinks = await extractGofileDirectLink(url);
            if (gofileLinks && gofileLinks.length > 0) return gofileLinks;
        }

        const html = await fetchHtmlWithRetry(url, parentUrl);
        const $ = cheerio.load(html);

        // 2. Check for `var reurl = "..."` (used by hubcdn.sbs, fastdl, gadgetsweb)
        const reurlMatch = html.match(/reurl\s*=\s*['"]([^'"]+)['"]/i);
        if (reurlMatch && reurlMatch[1]) {
            const reurl = reurlMatch[1];
            let target = reurl;
            try {
                const parsedUrl = new URL(reurl);
                const rParam = parsedUrl.searchParams.get('r');
                const linkParam = parsedUrl.searchParams.get('link');
                if (rParam) {
                    const decodedR = Buffer.from(rParam, 'base64').toString('utf8');
                    try {
                        const parsedDec = new URL(decodedR);
                        const subLink = parsedDec.searchParams.get('link');
                        if (subLink) target = subLink;
                        else target = decodedR;
                    } catch (e) {
                        target = decodedR;
                    }
                } else if (linkParam) {
                    target = linkParam;
                }
            } catch (e) {}

            console.log('[MovieScraper] Resolved var reurl target:', target);
            return [{ text: 'Direct CDN Link', href: target }];
        }

        // 3. Check if page contains intermediate links to HubCloud / VCloud (e.g. HubDrive pages)
        const hubcloudLinks = [];
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (!href) return;
            const lowerHref = href.toLowerCase();
            const isDrivePath = lowerHref.includes('/drive/') || lowerHref.includes('/file/') || lowerHref.includes('?id=');
            const isJunk = lowerHref.includes('telegram') || lowerHref.includes('/tg/') || lowerHref.includes('/admin') || lowerHref.includes('.fans');
            if ((lowerHref.includes('hubcloud') || lowerHref.includes('vcloud') || lowerHref.includes('katdrive') || lowerHref.includes('kmhd')) && isDrivePath && !isJunk) {
                if (!hubcloudLinks.some(hl => hl.href === href)) {
                    hubcloudLinks.push({ text: text || 'HubCloud Server', href });
                }
            }
        });

        if (hubcloudLinks.length > 0) {
            console.log(`[MovieScraper] Found ${hubcloudLinks.length} HubCloud link(s) on intermediate page.`);
            const allSubServers = [];
            for (const hcLink of hubcloudLinks) {
                const subOpts = await extractSubOptions(hcLink.href, url);
                allSubServers.push(...subOpts);
            }
            if (allSubServers.length > 0) return allSubServers;
        }

        // 4. Default: HubCloud / VCloud / GDflix double atob script or var url
        const scriptContent = $('script').text() || '';
        let decodedLink = null;

        const atobRegex = /atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
        let match = atobRegex.exec(scriptContent);
        if (match && match[1]) {
            try {
                const step1 = Buffer.from(match[1], 'base64').toString('utf8');
                decodedLink = Buffer.from(step1, 'base64').toString('utf8');
            } catch (e) {
                console.error('[MovieScraper] Failed decoding double atob:', e.message);
            }
        }

        if (!decodedLink) {
            const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
            const matchVar = varUrlRegex.exec(scriptContent);
            if (matchVar && matchVar[1]) {
                decodedLink = matchVar[1];
            }
        }

        if (!decodedLink && url.includes('/video/')) {
            const videoDl = $('div.vd > center > a').attr('href');
            if (videoDl) {
                decodedLink = videoDl;
            }
        }

        if (decodedLink) {
            if (!decodedLink.startsWith('http')) {
                const parsed = new URL(url);
                decodedLink = `${parsed.protocol}//${parsed.host}${decodedLink.startsWith('/') ? '' : '/'}${decodedLink}`;
            }

            console.log('[MovieScraper] Fetching final download landing page to extract options:', decodedLink);
            const dlHtml = await fetchHtmlWithRetry(decodedLink, url);
            const dl$ = cheerio.load(dlHtml);

            const finalLinks = [];
            dl$('h2 a.btn, div.card-body a.btn, a.btn, a[href]').each((_, el) => {
                let href = dl$(el).attr('href');
                let text = dl$(el).text().trim().replace(/\s+/g, ' ');

                const lowerText = text.toLowerCase();
                const lowerHref = href ? href.toLowerCase() : '';
                if (lowerText.includes('login') || lowerText.includes('admin') || lowerText.includes('idm') || lowerText.includes('ida') || lowerText.includes('telegram') || lowerHref.includes('telegram.me') || lowerHref.includes('t.me')) {
                    return;
                }

                if (href && (href.startsWith('http') || href.startsWith('/'))) {
                    if (!href.startsWith('http')) {
                        const parsed = new URL(decodedLink);
                        href = `${parsed.protocol}//${parsed.host}${href.startsWith('/') ? '' : '/'}${href}`;
                    }

                    if (href.includes('pixeldrain') && href.includes('/u/')) {
                        const id = href.split('/u/')[1].split('?')[0];
                        href = `https://pixeldrain.com/api/file/${id}?download`;
                    }

                    if (!finalLinks.some(fl => fl.href === href)) {
                        finalLinks.push({ text: text || 'Download Link', href });
                    }
                }
            });

            if (finalLinks.length > 0) {
                const match10G = finalLinks.filter(l => {
                    const t = `${l.text} ${l.href}`.toLowerCase();
                    return t.includes('10gbps') || t.includes('10 gbps') || t.includes('g-direct') || t.includes('gdirect');
                });
                const matchFslv2 = finalLinks.filter(l => {
                    const t = `${l.text} ${l.href}`.toLowerCase();
                    return t.includes('fslv2') || t.includes('fsl v2') || t.includes('fsl-v2');
                });
                const matchFsl = finalLinks.filter(l => {
                    const t = `${l.text} ${l.href}`.toLowerCase();
                    return (t.includes('fsl') || t.includes('fsl server') || t.includes('fastserver')) && !t.includes('fslv2') && !t.includes('fsl v2') && !t.includes('fsl-v2');
                });

                const sortedOnly3 = [...match10G, ...matchFslv2, ...matchFsl];
                if (sortedOnly3.length > 0) {
                    return sortedOnly3;
                }
                return [];
            }
        }

        return [];
    } catch (err) {
        console.error('[MovieScraper] extractSubOptions failed:', err.message);
        return [];
    }
}


/**
 * ============================================================
 * HDHub4u Sitemap-based Fallback Search
 * ============================================================
 * The Typesense API at search.pingora.fyi gets 403 from cloud/datacenter IPs
 * (GitHub Codespaces, Azure, etc.). This fallback fetches all post URLs from
 * the HDHub4u XML sitemaps and searches against them locally.
 * The sitemap is cached in memory and refreshed every 6 hours.
 */

// In-memory sitemap cache
let _sitemapCache = { urls: [], lastFetched: 0 };
const SITEMAP_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms
let _sitemapFetchPromise = null; // prevent concurrent fetches

/**
 * Fetch all post URLs from HDHub4u sitemaps (14 sitemap files, ~13k+ URLs).
 * Uses in-memory cache with 6-hour TTL.
 */
async function getHdhub4uSitemapUrls() {
    const now = Date.now();
    if (_sitemapCache.urls.length > 0 && (now - _sitemapCache.lastFetched) < SITEMAP_CACHE_TTL) {
        return _sitemapCache.urls;
    }

    // Prevent concurrent fetches (multiple searches happening at once)
    if (_sitemapFetchPromise) {
        return _sitemapFetchPromise;
    }

    _sitemapFetchPromise = (async () => {
        try {
            console.log('[DanieSearch] Fetching HDHub4u sitemaps for fallback search index...');
            const allUrls = [];

            // First fetch the sitemap index to discover all post-sitemap files
            let sitemapFiles = [];
            try {
                const indexRes = await axios.get('https://new3.hdhub4u.cl/sitemap.xml', {
                    headers: HEADERS,
                    timeout: 15000
                });
                const $ = cheerio.load(indexRes.data, { xmlMode: true });
                $('sitemap loc').each((_, el) => {
                    const loc = $(el).text();
                    if (loc.includes('post-sitemap')) {
                        sitemapFiles.push(loc);
                    }
                });
            } catch (e) {
                console.warn('[DanieSearch] Sitemap index fetch failed, using known pattern:', e.message);
            }

            // Fallback: if index fetch failed, use known pattern (post-sitemap through post-sitemap14)
            if (sitemapFiles.length === 0) {
                for (let i = 1; i <= 14; i++) {
                    const suffix = i === 1 ? '' : String(i);
                    sitemapFiles.push(`https://new3.hdhub4u.cl/post-sitemap${suffix}.xml`);
                }
            }

            // Fetch all sitemap files concurrently (batch of 4 at a time for speed)
            const batchSize = 4;
            for (let i = 0; i < sitemapFiles.length; i += batchSize) {
                const batch = sitemapFiles.slice(i, i + batchSize);
                const results = await Promise.allSettled(
                    batch.map(url =>
                        axios.get(url, { headers: HEADERS, timeout: 15000 })
                            .then(res => {
                                const $ = cheerio.load(res.data, { xmlMode: true });
                                const urls = [];
                                $('url loc').each((_, el) => urls.push($(el).text()));
                                return urls;
                            })
                    )
                );
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        allUrls.push(...result.value);
                    }
                }
            }

            console.log(`[DanieSearch] Sitemap index loaded: ${allUrls.length} URLs from ${sitemapFiles.length} sitemaps`);
            _sitemapCache = { urls: allUrls, lastFetched: Date.now() };
            return allUrls;
        } catch (err) {
            console.error('[DanieSearch] Sitemap fetch failed:', err.message);
            return _sitemapCache.urls; // Return stale cache if available
        } finally {
            _sitemapFetchPromise = null;
        }
    })();

    return _sitemapFetchPromise;
}

/**
 * Search HDHub4u posts using the cached sitemap URLs.
 * Performs fuzzy matching on URL slugs.
 */
async function searchHdhub4uViaSitemap(query) {
    const urls = await getHdhub4uSitemapUrls();
    if (urls.length === 0) return [];

    const lq = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const words = lq.split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return [];

    const scored = [];
    for (const url of urls) {
        // Extract slug from URL
        const slug = url.replace(/\/$/, '').split('/').pop() || '';
        const cleanSlug = slug.replace(/-/g, ' ').toLowerCase();

        let score = 0;
        let matchedWords = 0;

        for (const word of words) {
            if (cleanSlug.includes(word)) {
                score += word.length;
                matchedWords++;
            }
        }

        // Skip if the primary keyword (first word) doesn't match
        if (!cleanSlug.includes(words[0])) continue;
        if (matchedWords === 0) continue;

        // Bonus for matching ALL query words
        if (matchedWords === words.length) score += 20;
        // Bonus for matching most words
        if (matchedWords >= words.length * 0.75) score += 10;

        // Build a readable title from slug
        const title = slug
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .replace(/^\s+|\s+$/g, '');

        scored.push({
            title,
            permalink: url,
            thumbnail: null,
            score,
            matchedWords
        });
    }

    // Sort by score descending, then shorter URLs first (more specific)
    scored.sort((a, b) => b.score - a.score || a.permalink.length - b.permalink.length);

    // Return top 15 results
    return scored.slice(0, 15).map(({ title, permalink, thumbnail }) => ({
        title,
        permalink,
        thumbnail
    }));
}

/**
 * Search HDHub4u via Typesense API with robust retries, query variants, and full headers.
 * Falls back to sitemap-based search if Typesense API fails (e.g., 403 from cloud IPs).
 */
async function searchHdhub4u(query) {
    if (!query || !query.trim()) return [];
    const today = new Date().toISOString().split('T')[0];

    const cleanQuery = query.trim();
    const queriesToTry = [cleanQuery];

    // If query has spaces (e.g. "dare devil born"), also try joining/cleaning words as fallback
    const words = cleanQuery.split(/\s+/);
    if (words.length > 1) {
        const joined = words.join('');
        if (!queriesToTry.includes(joined)) queriesToTry.push(joined);
        const firstTwo = words.slice(0, 2).join(' ');
        if (!queriesToTry.includes(firstTwo)) queriesToTry.push(firstTwo);
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Referer': 'https://new3.hdhub4u.cl/search.html',
        'Origin': 'https://new3.hdhub4u.cl',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
    };

    // === PRIMARY: Try Typesense API ===
    let typesenseFailed = false;
    for (const q of queriesToTry) {
        console.log(`[DanieSearch] Trying HDHub4u Typesense search: "${q}"...`);
        const apiUrl = new URL('https://search.pingora.fyi/collections/post/documents/search');
        apiUrl.searchParams.append('q', q);
        apiUrl.searchParams.append('query_by', 'post_title,category,stars,director,imdb_id');
        apiUrl.searchParams.append('query_by_weights', '4,2,2,2,4');
        apiUrl.searchParams.append('sort_by', 'sort_by_date:desc');
        apiUrl.searchParams.append('limit', 15);
        apiUrl.searchParams.append('highlight_fields', 'none');
        apiUrl.searchParams.append('use_cache', 'true');
        apiUrl.searchParams.append('page', 1);
        apiUrl.searchParams.append('analytics_tag', today);

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const res = await axios.get(apiUrl.toString(), {
                    headers,
                    httpsAgent: browserHttpsAgent,
                    timeout: 8000
                });

                if (res.data && res.data.hits && res.data.hits.length > 0) {
                    console.log(`[DanieSearch] Typesense search succeeded for "${q}" (${res.data.hits.length} hits)`);
                    return res.data.hits.map(h => ({
                        title: h.document.post_title.replace(/&amp;/g, '&'),
                        permalink: h.document.permalink.startsWith('http') ? h.document.permalink : `https://new3.hdhub4u.cl${h.document.permalink.startsWith('/') ? '' : '/'}${h.document.permalink}`,
                        thumbnail: h.document.post_thumbnail
                    }));
                }
            } catch (err) {
                const status = err.response ? err.response.status : 'N/A';
                console.error(`[DanieSearch] Typesense attempt ${attempt} failed for "${q}": ${err.message} (status=${status})`);
                if (status === 403 || status === 503) {
                    typesenseFailed = true;
                    break; // Don't retry on 403/503, go straight to fallback
                }
                if (attempt < 2) await new Promise(r => setTimeout(r, 500));
            }
        }
        if (typesenseFailed) break; // Skip other query variants, go to fallback
    }

    // === FALLBACK: Search via sitemap ===
    console.log(`[DanieSearch] Typesense API unavailable, falling back to sitemap search for "${cleanQuery}"...`);
    try {
        const sitemapResults = await searchHdhub4uViaSitemap(cleanQuery);
        if (sitemapResults.length > 0) {
            console.log(`[DanieSearch] Sitemap fallback found ${sitemapResults.length} results for "${cleanQuery}"`);
            return sitemapResults;
        }
    } catch (err) {
        console.error('[DanieSearch] Sitemap fallback failed:', err.message);
    }

    return [];
}

/**
 * Concurrency runner helper (executes at most limit functions concurrently)
 */
async function runWithConcurrency(items, limit, workerFn) {
    const results = new Array(items.length);
    let index = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const currentIndex = index++;
            try {
                results[currentIndex] = await workerFn(items[currentIndex], currentIndex);
            } catch (err) {
                console.error(`[ConcurrencyRunner] Item ${currentIndex} failed:`, err.message);
                results[currentIndex] = null;
            }
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Resolves a single VCloud episode link with a 20s timeout and strict server prioritization (10gbps > fslv2 > fsl)
 */
async function resolveSingleVcloudEpisode(vUrl, referer = null, timeoutMs = 20000) {
    const cancelTokenSource = axios.CancelToken.source();
    const timer = setTimeout(() => {
        cancelTokenSource.cancel(`Extraction timed out after ${timeoutMs / 1000} seconds`);
    }, timeoutMs);

    try {
        const HEADERS = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
            'Referer': referer || 'https://vegamovies.im/'
        };

        // Step 1: Fetch the VCloud episode page
        const vRes = await axios.get(vUrl, {
            headers: HEADERS,
            cancelToken: cancelTokenSource.token,
            timeout: timeoutMs,
            httpsAgent: browserHttpsAgent
        });

        // Parse response for double atob or var url
        let tokenUrl = null;
        const atobMatch = (vRes.data || '').match(/atob\(\s*atob\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
        if (atobMatch) {
            const s1 = Buffer.from(atobMatch[1], 'base64').toString('utf8');
            tokenUrl = Buffer.from(s1, 'base64').toString('utf8');
        } else {
            const varUrlRegex = /var\s+url\s*=\s*['"]([^'"]+)['"]/i;
            const matchVar = varUrlRegex.exec(vRes.data || '');
            if (matchVar && matchVar[1]) {
                tokenUrl = matchVar[1];
            }
        }

        if (!tokenUrl) {
            tokenUrl = vUrl;
        }

        let fullTokenUrl = tokenUrl;
        if (!fullTokenUrl.startsWith('http')) {
            const parsed = new URL(vUrl);
            fullTokenUrl = `${parsed.protocol}//${parsed.host}${fullTokenUrl.startsWith('/') ? '' : '/'}${fullTokenUrl}`;
        }

        // Step 2: Fetch decoded server page if tokenUrl differs from vUrl
        let serverHtml = vRes.data;
        if (fullTokenUrl !== vUrl) {
            const dlRes = await axios.get(fullTokenUrl, {
                headers: { ...HEADERS, 'Referer': vUrl },
                cancelToken: cancelTokenSource.token,
                timeout: timeoutMs,
                httpsAgent: browserHttpsAgent
            });
            serverHtml = dlRes.data;
        }

        const $ = cheerio.load(serverHtml || '');
        const servers = [];

        $('a[href]').each((_, a) => {
            const h = $(a).attr('href');
            const text = $(a).text().trim();
            if (h && (h.startsWith('http') || h.startsWith('/'))) {
                const lowerText = text.toLowerCase();
                const lowerH = h.toLowerCase();
                if (!lowerH.includes('telegram') && !lowerH.includes('.fans') && !lowerText.includes('login') && !lowerText.includes('admin') && text) {
                    let fullH = h;
                    if (!fullH.startsWith('http')) {
                        const parsed = new URL(fullTokenUrl);
                        fullH = `${parsed.protocol}//${parsed.host}${fullH.startsWith('/') ? '' : '/'}${fullH}`;
                    }
                    servers.push({ text, href: fullH });
                }
            }
        });

        // Step 3: Server selection (10gbps > fslv2 > fsl ONLY)
        const match10g = servers.find(s => {
            const t = `${s.text} ${s.href}`.toLowerCase();
            return t.includes('10gbps') || t.includes('10 gbps') || t.includes('g-direct') || t.includes('gdirect');
        });

        const matchFslv2 = servers.find(s => {
            const t = `${s.text} ${s.href}`.toLowerCase();
            return t.includes('fslv2') || t.includes('fsl v2') || t.includes('fsl-v2');
        });

        const matchFsl = servers.find(s => {
            const t = `${s.text} ${s.href}`.toLowerCase();
            return (t.includes('fsl') || t.includes('fsl server')) && !t.includes('fslv2') && !t.includes('fsl v2') && !t.includes('fsl-v2');
        });

        let selected = null;
        let serverType = '';

        if (match10g) {
            selected = match10g;
            serverType = '10Gbps';
        } else if (matchFslv2) {
            selected = matchFslv2;
            serverType = 'FSLv2';
        } else if (matchFsl) {
            selected = matchFsl;
            serverType = 'FSL';
        }

        // Strictly reject if none of 10gbps, fslv2, or fsl exist
        if (!selected) {
            console.log(`[SeriesVcloudExtractor] No 10gbps, fslv2, or fsl server found for: ${vUrl}`);
            return null;
        }

        let directUrl = selected.href;

        // If 10gbps, resolve redirect chain / link= parameter if present
        if (serverType === '10Gbps') {
            try {
                let redirectUrl = await resolveFinalUrl(directUrl);
                if (redirectUrl && redirectUrl.includes('link=')) {
                    redirectUrl = redirectUrl.split('link=')[1];
                    if (redirectUrl.includes('&')) redirectUrl = redirectUrl.split('&')[0];
                    redirectUrl = decodeURIComponent(redirectUrl);
                }
                directUrl = redirectUrl || directUrl;
            } catch (e) {
                console.error(`[SeriesVcloudExtractor] 10Gbps redirect chain resolution error:`, e.message);
            }
        }

        return {
            serverType,
            serverText: selected.text,
            directUrl
        };
    } catch (err) {
        console.error(`[SeriesVcloudExtractor] Episode resolution failed for ${vUrl}:`, err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Extracts all series episodes from a Nextdrive page:
 * - Collects all VCloud episode links from landing page.
 * - Extracts 2 episode links simultaneously (concurrency = 2).
 * - Applies a 20-second timeout per episode.
 * - Filters servers to ONLY keep 1 link per episode in order of 10gbps > fslv2 > fsl (rejecting all others).
 * - Returns a formatted WhatsApp copyable message.
 */
async function extractSeriesVcloudLinks(nextdriveUrl, options = {}) {
    const timeoutMs = options.timeoutMs || 20000;
    const concurrency = options.concurrency || 2;
    const referer = options.referer || 'https://vegamovies.im/';

    console.log(`[SeriesVcloudExtractor] Scraping Nextdrive landing page: ${nextdriveUrl}`);

    const res = await axios.get(nextdriveUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
            'Referer': referer
        },
        timeout: timeoutMs,
        httpsAgent: browserHttpsAgent
    });

    const $ = cheerio.load(res.data);
    const pageTitle = $('title').text().trim() || $('h1').text().trim() || 'Series Episodes';

    const rawLinks = [];
    $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('vcloud')) {
            if (!rawLinks.some(l => l.href === href)) {
                let epLabel = findEpisodeText($, el, pageTitle);
                if (!epLabel || epLabel.trim() === '' || epLabel.toLowerCase().includes('download')) {
                    epLabel = `Episode ${String(rawLinks.length + 1).padStart(2, '0')}`;
                }
                rawLinks.push({
                    index: rawLinks.length + 1,
                    epLabel,
                    href
                });
            }
        }
    });

    console.log(`[SeriesVcloudExtractor] Found ${rawLinks.length} VCloud episode link(s).`);

    if (rawLinks.length === 0) {
        return {
            title: pageTitle,
            episodes: [],
            whatsappMessage: `❌ No VCloud episode links found on landing page.`
        };
    }

    const workerFn = async (item) => {
        console.log(`[SeriesVcloudExtractor] Processing [${item.epLabel}] (Concurrency 2): ${item.href}`);
        const resolved = await resolveSingleVcloudEpisode(item.href, nextdriveUrl, timeoutMs);
        if (resolved) {
            return {
                epLabel: item.epLabel,
                index: item.index,
                serverType: resolved.serverType,
                directUrl: resolved.directUrl
            };
        }
        return null;
    };

    const results = await runWithConcurrency(rawLinks, concurrency, workerFn);
    const resolvedEpisodes = results.filter(Boolean);

    let whatsappMessage = `📺 *${pageTitle}*\n\n`;
    if (resolvedEpisodes.length === 0) {
        whatsappMessage += `❌ No valid 10Gbps, FSLv2, or FSL links could be extracted.`;
    } else {
        resolvedEpisodes.forEach(ep => {
            whatsappMessage += `*${ep.epLabel}* (${ep.serverType}):\n\`${ep.directUrl}\`\n\n`;
        });
        whatsappMessage += `_Extracted ${resolvedEpisodes.length}/${rawLinks.length} episode(s) (Priority: 10Gbps > FSLv2 > FSL)._`;
    }

    return {
        title: pageTitle,
        totalFound: rawLinks.length,
        resolvedCount: resolvedEpisodes.length,
        episodes: resolvedEpisodes,
        whatsappMessage: whatsappMessage.trim()
    };
}

module.exports = {
    browserHttpsAgent,
    fetchHtmlWithRetry,
    fetchTmdbMetadata,
    fetchTmdbById,
    fetchTmdbTrailerUrl,
    downloadYoutubeVideoUrl,
    scrapePostPage,
    resolveLandingLink,
    resolveVcloudLink,
    resolveFinalUrl,
    cleanTitle,
    scrapeAllPostLinks,
    extractDirectDownloadLinks,
    extractSubOptions,
    extractGofileDirectLink,
    searchHdhub4u,
    searchHdhub4uViaSitemap,
    getHdhub4uSitemapUrls,
    extractSeriesVcloudLinks,
    resolveSingleVcloudEpisode,
    runWithConcurrency
};
