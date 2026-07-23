const axios = require('axios');
const cheerio = require('cheerio');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

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

async function parseM3u8Segments(m3u8Url, referer) {
    const headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': referer
    };

    let res = await axios.get(m3u8Url, { headers, httpAgent, httpsAgent, timeout: 15000 });
    let content = res.data;
    let finalMediaUrl = m3u8Url;

    if (content.includes('#EXT-X-STREAM-INF')) {
        const lines = content.split('\n');
        let selectedSubUrl = '';
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                for (let j = i + 1; j < lines.length; j++) {
                    const l = lines[j].trim();
                    if (l && !l.startsWith('#')) {
                        selectedSubUrl = l;
                        break;
                    }
                }
            }
        }
        if (selectedSubUrl) {
            const resolvedSubUrl = new URL(selectedSubUrl, m3u8Url).href;
            res = await axios.get(resolvedSubUrl, { headers, httpAgent, httpsAgent, timeout: 15000 });
            content = res.data;
            finalMediaUrl = resolvedSubUrl;
        }
    }

    const lines = content.split('\n');
    const segmentUrls = [];
    let isKeyEncrypted = false;
    let totalDurationSeconds = 0;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('#EXTINF:')) {
            const match = line.match(/#EXTINF:([\d.]+)/);
            if (match) totalDurationSeconds += parseFloat(match[1]);
        }
        if (line.startsWith('#EXT-X-KEY')) {
            isKeyEncrypted = true;
        }
        if (line && !line.startsWith('#')) {
            const absoluteUrl = new URL(line, finalMediaUrl).href;
            segmentUrls.push(absoluteUrl);
        }
    }

    return {
        segmentUrls,
        isKeyEncrypted,
        mediaM3u8Url: finalMediaUrl,
        totalDurationSeconds,
        durationMinutes: (totalDurationSeconds / 60).toFixed(1)
    };
}

function downloadStreamWithTunedFFmpeg(streamUrl, outputPath, referer = 'https://nextgencloudfabric.com/') {
    return new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-probesize', '32K',
            '-analyzeduration', '0',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-http_persistent', '1',
            '-rw_timeout', '15000000',
            '-headers', `Referer: ${referer}\r\nUser-Agent: ${HEADERS['User-Agent']}\r\n`,
            '-i', streamUrl,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            outputPath
        ];

        console.log(`[FFmpeg-Tuned] Command: ffmpeg ${args.join(' ')}`);
        const ffmpeg = spawn('ffmpeg', args);

        let errorLog = '';
        ffmpeg.stderr.on('data', (data) => {
            errorLog += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                console.log(`[FFmpeg-Tuned] Success: ${outputPath}`);
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg failed (code ${code}): ${errorLog.slice(-300)}`));
            }
        });

        ffmpeg.on('error', (err) => reject(err));
    });
}

/**
 * High-speed parallel HLS downloader using 12 concurrent HTTP connections with 429 backoff retries & tuned FFmpeg fallback
 * @param {string} streamUrl Direct stream or m3u8 URL
 * @param {string} outputPath Target .mp4 file path
 * @param {string} referer Referer header
 * @param {number} concurrency Number of parallel segment download threads (default: 12)
 * @param {Function} [onProgress] Progress callback: ({ completed, total, downloadedMB, totalEstMB, speedMBs, percentage }) => void
 * @returns {Promise<string>} Output path
 */
async function downloadStreamWithFFmpeg(streamUrl, outputPath, referer = 'https://nextgencloudfabric.com/', concurrency = 12, onProgress = null) {
    const startTime = Date.now();
    console.log(`[FastHLS] Initializing high-speed parallel downloader for: ${streamUrl}`);

    let segmentData;
    try {
        segmentData = await parseM3u8Segments(streamUrl, referer);
    } catch (parseErr) {
        console.warn(`[FastHLS] Failed to parse m3u8 playlist (${parseErr.message}). Falling back to tuned FFmpeg...`);
        return downloadStreamWithTunedFFmpeg(streamUrl, outputPath, referer);
    }

    const { segmentUrls, isKeyEncrypted, mediaM3u8Url } = segmentData;
    const targetM3u8Url = mediaM3u8Url || streamUrl;

    if (isKeyEncrypted || segmentUrls.length === 0) {
        console.log(`[FastHLS] Stream is encrypted or single binary file. Using tuned FFmpeg on ${targetM3u8Url}...`);
        return downloadStreamWithTunedFFmpeg(targetM3u8Url, outputPath, referer);
    }

    console.log(`[FastHLS] Downloading ${segmentUrls.length} HLS segments in parallel (${concurrency} workers)...`);

    const tempTsDir = path.join(path.dirname(outputPath), `hls_segments_${Date.now()}`);
    if (!fs.existsSync(tempTsDir)) fs.mkdirSync(tempTsDir, { recursive: true });

    const headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': referer
    };

    let completed = 0;
    let downloadedBytes = 0;
    const total = segmentUrls.length;
    let lastProgressNotify = 0;

    const downloadSegment = async (index) => {
        const segUrl = segmentUrls[index];
        const segPath = path.join(tempTsDir, `seg_${String(index).padStart(6, '0')}.ts`);

        let attempts = 0;
        const maxAttempts = 6;
        while (attempts < maxAttempts) {
            try {
                attempts++;
                const response = await axios({
                    method: 'get',
                    url: segUrl,
                    headers,
                    responseType: 'arraybuffer',
                    httpAgent,
                    httpsAgent,
                    timeout: 15000
                });
                fs.writeFileSync(segPath, response.data);
                completed++;
                downloadedBytes += response.data.byteLength || response.data.length || 0;

                const now = Date.now();
                const elapsedSec = (now - startTime) / 1000 || 0.001;
                const downloadedMB = downloadedBytes / (1024 * 1024);
                const speedMBs = downloadedMB / elapsedSec;
                const percentage = Math.round((completed / total) * 100);
                const totalEstMB = percentage > 0 ? (downloadedMB / (percentage / 100)) : 0;

                if (completed % 50 === 0 || completed === total) {
                    console.log(`[FastHLS] Progress: ${completed}/${total} (${percentage}%) | ${downloadedMB.toFixed(1)}MB downloaded @ ${speedMBs.toFixed(1)} MB/s`);
                }

                if (typeof onProgress === 'function' && (now - lastProgressNotify > 3000 || completed === total)) {
                    lastProgressNotify = now;
                    try {
                        onProgress({
                            completed,
                            total,
                            downloadedMB: parseFloat(downloadedMB.toFixed(1)),
                            totalEstMB: parseFloat(totalEstMB.toFixed(1)),
                            speedMBs: parseFloat(speedMBs.toFixed(1)),
                            percentage
                        });
                    } catch (_) {}
                }
                return;
            } catch (err) {
                const status = err.response ? err.response.status : 0;
                if (status === 429) {
                    const backoffMs = attempts * 1500 + Math.floor(Math.random() * 500);
                    console.warn(`[FastHLS] 429 Rate limited on segment ${index}. Retrying in ${backoffMs}ms (attempt ${attempts}/${maxAttempts})...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                } else if (attempts >= maxAttempts) {
                    throw new Error(`Failed segment ${index}: ${err.message}`);
                } else {
                    await new Promise(r => setTimeout(r, 500 * attempts));
                }
            }
        }
    };

    const queue = segmentUrls.map((_, i) => i);
    const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
            const idx = queue.shift();
            if (idx !== undefined) {
                await downloadSegment(idx);
                // 15ms stagger to prevent CDN micro-burst rate limits
                await new Promise(r => setTimeout(r, 15));
            }
        }
    });

    try {
        await Promise.all(workers);
        const concatTsPath = path.join(tempTsDir, 'combined.ts');
        const writeStream = fs.createWriteStream(concatTsPath);

        for (let i = 0; i < total; i++) {
            const segPath = path.join(tempTsDir, `seg_${String(i).padStart(6, '0')}.ts`);
            if (fs.existsSync(segPath)) {
                writeStream.write(fs.readFileSync(segPath));
                try { fs.unlinkSync(segPath); } catch (_) {}
            }
        }
        writeStream.end();
        await new Promise(resolve => writeStream.on('finish', resolve));

        console.log(`[FastHLS] Remuxing combined segments into MP4...`);
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-y',
                '-i', concatTsPath,
                '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc',
                '-movflags', '+faststart',
                outputPath
            ]);
            ffmpeg.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    resolve();
                } else {
                    reject(new Error(`FFmpeg remux failed with code ${code}`));
                }
            });
        });

        // Cleanup
        try {
            if (fs.existsSync(concatTsPath)) fs.unlinkSync(concatTsPath);
            fs.rmdirSync(tempTsDir);
        } catch (_) {}

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
        const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
        console.log(`[FastHLS] Complete! ${sizeMB} MB downloaded and saved to ${outputPath} in ${durationSec}s`);
        return outputPath;
    } catch (err) {
        console.warn(`[FastHLS] Parallel download error (${err.message}). Falling back to tuned FFmpeg on ${targetM3u8Url}...`);
        try {
            if (fs.existsSync(tempTsDir)) fs.rmdirSync(tempTsDir, { recursive: true });
        } catch (_) {}
        return downloadStreamWithTunedFFmpeg(targetM3u8Url, outputPath, referer);
    }
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
