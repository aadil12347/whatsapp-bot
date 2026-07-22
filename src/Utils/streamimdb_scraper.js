const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://streamimdb.ru';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Search streamimdb.ru for movies & TV series
 * @param {string} query Search query string
 * @returns {Promise<Array<{title: string, year: string, type: string, href: string, poster: string}>>}
 */
async function searchStreamImdb(query) {
    const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const results = [];
    $('.cb-card').each((i, el) => {
        if (i >= 15) return;
        const a = $(el).find('a').first();
        const href = a.attr('href') || '';
        const title = $(el).find('.cb-card-title').text().trim() || 'Unknown Title';
        const year = $(el).find('.cb-card-meta').text().trim() || 'N/A';
        const badge = $(el).find('.cb-card-badge').text().trim();
        const isTv = badge.toLowerCase().includes('tv') || href.includes('/tv/');
        const type = isTv ? 'tv' : 'movie';
        const poster = $(el).find('img').attr('src') || '';

        if (href && title) {
            results.push({
                title,
                year,
                type,
                href: href.startsWith('/') ? `${BASE_URL}${href}` : href,
                poster
            });
        }
    });

    return results;
}

/**
 * Get details for a movie or TV show
 * @param {string} url Detail page URL
 * @returns {Promise<{isTv: boolean, title: string, poster: string, overview: string, embedUrl?: string, seasons?: Array<{seasonNum: number, episodes: Array<{epNum: number, title: string, href: string}>}>}>}
 */
async function getMediaDetails(url) {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const title = $('h1, .cb-detail-title-logo, meta[property="og:title"]').first().attr('content') || $('title').text().replace('| StreamIMDB', '').trim();
    const overview = $('#cbPlot').text().trim() || $('meta[name="description"]').attr('content') || '';
    const poster = $('meta[property="og:image"]').attr('content') || '';

    const seasons = [];
    $('.cb-season').each((i, sEl) => {
        const seasonNumText = $(sEl).find('.cb-season-number').text().trim() || `Season ${i + 1}`;
        const sMatch = seasonNumText.match(/Season\s*(\d+)/i);
        const seasonNum = sMatch ? parseInt(sMatch[1], 10) : (i + 1);

        const episodes = [];
        $(sEl).find('.cb-episode-item').each((j, epEl) => {
            const epHref = $(epEl).attr('href') || '';
            const epNumText = $(epEl).find('.cb-episode-num').text().trim() || `${j + 1}`;
            const epTitle = $(epEl).find('.cb-episode-title').text().trim() || `Episode ${j + 1}`;
            const epNum = parseInt(epNumText, 10) || (j + 1);

            if (epHref) {
                episodes.push({
                    epNum,
                    title: epTitle,
                    href: epHref.startsWith('/') ? `${BASE_URL}${epHref}` : epHref
                });
            }
        });

        if (episodes.length > 0) {
            seasons.push({ seasonNum, episodes });
        }
    });

    const isTv = seasons.length > 0 || url.includes('/tv/');

    let embedUrl = '';
    if (!isTv) {
        let embedSrc = $('#cbMoviePlayer').attr('data-src') || $('#cbMoviePlayer').attr('src') || '';
        if (!embedSrc) {
            const match = res.data.match(/data-src=["'](\/embed\/[^"']+)["']/i) || res.data.match(/["'](\/embed\/(?:movie|tv)\/[^"']+)["']/i);
            if (match) embedSrc = match[1];
        }
        embedUrl = embedSrc ? (embedSrc.startsWith('/') ? `${BASE_URL}${embedSrc}` : embedSrc) : '';
    }

    return {
        isTv,
        title,
        poster,
        overview,
        embedUrl,
        seasons
    };
}

/**
 * Fetch episode detail page and get its embed URL
 * @param {string} epUrl Episode page URL
 * @returns {Promise<string>} Embed URL
 */
async function getEpisodeEmbedUrl(epUrl) {
    const res = await axios.get(epUrl, { headers: HEADERS, timeout: 15000 });
    const $ = cheerio.load(res.data);
    let embedSrc = $('#cbMoviePlayer').attr('data-src') || $('#cbMoviePlayer').attr('src') || '';
    if (!embedSrc) {
        const match = res.data.match(/data-src=["'](\/embed\/[^"']+)["']/i) || res.data.match(/["'](\/embed\/tv\/[^"']+)["']/i);
        if (match) embedSrc = match[1];
    }
    return embedSrc ? (embedSrc.startsWith('/') ? `${BASE_URL}${embedSrc}` : embedSrc) : '';
}

/**
 * Resolve available qualities for a movie or TV episode by parsing player iframe & calling StreamData API
 * @param {string} embedUrl Embed player URL (e.g. /embed/movie/{id} or /embed/tv/{id}/{s}/{e})
 * @returns {Promise<Array<{quality: string, streamUrl: string}>>}
 */
async function resolveStreamOptions(embedUrl) {
    const fullEmbedUrl = embedUrl.startsWith('/') ? `${BASE_URL}${embedUrl}` : embedUrl;
    console.log(`[StreamIMDB] Fetching embed player page: ${fullEmbedUrl}`);

    const res1 = await axios.get(fullEmbedUrl, { headers: HEADERS, timeout: 15000 });
    const $1 = cheerio.load(res1.data);
    let nextgenUrl = $1('#pf').attr('src') || '';

    if (!nextgenUrl) {
        const match = res1.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (match) nextgenUrl = match[1];
    }

    if (!nextgenUrl) {
        throw new Error('Could not find player iframe on StreamIMDB embed page.');
    }

    if (nextgenUrl.startsWith('//')) nextgenUrl = `https:${nextgenUrl}`;

    console.log(`[StreamIMDB] Parsing stream token from server: ${nextgenUrl}`);
    const res2 = await axios.get(nextgenUrl, {
        headers: {
            ...HEADERS,
            'Referer': fullEmbedUrl
        },
        timeout: 15000
    });

    const configMatch = res2.data.match(/const CONFIG = ({[\s\S]*?});/);
    if (!configMatch) {
        throw new Error('Could not parse player CONFIG from stream server.');
    }

    const config = JSON.parse(configMatch[1]);
    let apiUrl = `${config.streamDataApiUrl || 'https://streamdata.vaplayer.ru/api.php'}?${config.idType || 'tmdb'}=${config.mediaId}&type=${config.mediaType || 'movie'}`;
    if (config.mediaType === 'tv' && config.season && config.episode) {
        apiUrl += `&season=${config.season}&episode=${config.episode}`;
    }
    apiUrl += `&token=${config.playToken}&tokenTs=${config.playTokenTs}`;

    console.log(`[StreamIMDB] Querying StreamData API: ${apiUrl}`);
    const apiRes = await axios.get(apiUrl, {
        headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Referer': nextgenUrl,
            'Origin': new URL(nextgenUrl).origin
        },
        timeout: 15000
    });

    if (!apiRes.data || apiRes.data.status_code !== '200' || !apiRes.data.data || !apiRes.data.data.stream_urls) {
        throw new Error(`Failed to resolve stream links from player backend: ${JSON.stringify(apiRes.data)}`);
    }

    const rawStreamUrls = apiRes.data.data.stream_urls || [];
    const qualityLabels = ['1080p Full HD (Fast)', '720p HD (Server 2)', '480p SD (Server 3)', '360p SD (Server 4)'];

    const validStreams = [];
    for (let idx = 0; idx < rawStreamUrls.length; idx++) {
        const url = rawStreamUrls[idx];
        if (!url || url.includes('putgate.com')) continue; // Skip broken putgate.com 404 CDN links

        validStreams.push({
            quality: qualityLabels[idx] || `Server ${idx + 1}`,
            streamUrl: url
        });
    }

    if (validStreams.length === 0 && rawStreamUrls.length > 0) {
        validStreams.push({
            quality: qualityLabels[0] || '1080p Full HD (Fast)',
            streamUrl: rawStreamUrls[0]
        });
    }

    return validStreams;
}

/**
 * Downloads m3u8 or video stream to MP4 using FFmpeg
 * @param {string} streamUrl Direct stream or m3u8 URL
 * @param {string} outputPath Target .mp4 file path
 * @param {string} referer Referer header
 * @returns {Promise<string>} Output path
 */
function downloadStreamWithFFmpeg(streamUrl, outputPath, referer = 'https://nextgencloudfabric.com/') {
    return new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-headers', `Referer: ${referer}\r\nUser-Agent: ${HEADERS['User-Agent']}\r\n`,
            '-i', streamUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            outputPath
        ];

        console.log(`[FFmpeg-StreamIMDB] Command: ffmpeg ${args.join(' ')}`);
        const ffmpeg = spawn('ffmpeg', args);

        let errorLog = '';
        ffmpeg.stderr.on('data', (data) => {
            errorLog += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                console.log(`[FFmpeg-StreamIMDB] Success: ${outputPath}`);
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg failed (code ${code}): ${errorLog.slice(-300)}`));
            }
        });

        ffmpeg.on('error', (err) => reject(err));
    });
}

/**
 * Verifies MP4 media file integrity using FFprobe
 * @param {string} filePath Path to output MP4
 * @returns {Promise<{valid: boolean, duration: number, sizeMB: number}>}
 */
function verifyMediaFile(filePath) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) return resolve({ valid: false, duration: 0, sizeMB: 0 });

        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB === 0) return resolve({ valid: false, duration: 0, sizeMB: 0 });

        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);

        let output = '';
        ffprobe.stdout.on('data', data => output += data.toString());

        ffprobe.on('close', (code) => {
            const duration = parseFloat(output.trim());
            const valid = code === 0 && !isNaN(duration) && duration > 0;
            resolve({ valid, duration, sizeMB });
        });
    });
}

module.exports = {
    searchStreamImdb,
    getMediaDetails,
    getEpisodeEmbedUrl,
    resolveStreamOptions,
    downloadStreamWithFFmpeg,
    verifyMediaFile
};
