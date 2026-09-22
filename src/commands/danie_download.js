const { cmd } = require('../Utils/command');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fileType = require('file-type');
const { browserHttpsAgent, applyPixeldrainWorkerProxy, isAdLink, fetchHtmlWithRetry, fetchTmdbMetadata, fetchTmdbById, downloadYoutubeVideoUrl, scrapePostPage, resolveLandingLink, resolveVcloudLink, resolveFinalUrl, scrapeAllPostLinks, extractDirectDownloadLinks, extractSubOptions, searchHdhub4u, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');
const { searchStreamImdb, getMediaDetails, getEpisodeEmbedUrl, resolveStreamOptions, downloadStreamWithFFmpeg, verifyMediaFile } = require('../Utils/streamimdb_scraper');
const { getDomain, getDomains, setDomain } = require('../Utils/domain_manager');

// Global handlers to prevent background network disconnect errors from crashing the Node process
process.on('unhandledRejection', (reason, promise) => {
    console.error('[DanieWatch] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});
function formatUptime(seconds) {
    seconds = Number(seconds) || 0;
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}

function cleanFileName(filename) {
    if (!filename) return '';
    // Strip extensions like .mp4, .mkv, .avi, .webm, etc.
    return filename.replace(/\.(mp4|mkv|avi|webm|mov|3gp|srt)$/i, '').trim();
}

/**
 * Standardized file name generator: Title (Year) [Season/Episode] Quality - DanieWatch.mp4
 */
function buildFormattedDanieFileName(title, year = '', seasonNum = null, epNum = null, quality = '', ext = 'mp4') {
    let cleanTitle = (title || 'Media')
        .replace(/^Watch\s+/i, '')
        .replace(/\s+Online\s+Free.*$/i, '')
        .replace(/\s*\|\s*StreamIMDB/i, '')
        .replace(/\s*\|\s*Vegamovies/i, '')
        .replace(/\s*\|\s*Rogmovies/i, '')
        .replace(/\s*\|\s*HDHub4u/i, '')
        .trim();

    let parsedYear = year;
    if (!parsedYear) {
        const yMatch = cleanTitle.match(/\((\d{4})\)/) || cleanTitle.match(/\b(19\d\d|20\d\d)\b/);
        if (yMatch) {
            parsedYear = yMatch[1];
        }
    }
    cleanTitle = cleanTitle.replace(/\s*\(\d{4}\)/g, '').replace(/\b(19\d\d|20\d\d)\b/g, '').trim();

    let sNum = seasonNum;
    let eNum = epNum;
    if (sNum === null || sNum === undefined || eNum === null || eNum === undefined) {
        const seMatch = cleanTitle.match(/S(\d+)\s*E(\d+)/i);
        if (seMatch) {
            sNum = parseInt(seMatch[1], 10);
            eNum = parseInt(seMatch[2], 10);
            cleanTitle = cleanTitle.replace(/S\d+\s*E\d+.*/i, '').trim();
        }
    }

    let cleanQuality = (quality || '')
        .replace(/\s*\([^)]*\)/g, '')
        .trim();

    const parts = [cleanTitle];

    if (parsedYear && (sNum === null || sNum === undefined)) {
        parts.push(`(${parsedYear})`);
    }

    if (sNum !== null && sNum !== undefined && eNum !== null && eNum !== undefined) {
        const sLabel = `S${String(sNum).padStart(2, '0')}`;
        const eLabel = `E${String(eNum).padStart(2, '0')}`;
        parts.push(`${sLabel}${eLabel}`);
    }

    if (cleanQuality) {
        parts.push(cleanQuality);
    }

    parts.push('- DanieWatch');

    let base = parts.join(' ').replace(/[:*?"<>|\\/]/g, '').replace(/\s+/g, ' ').trim();
    if (ext) {
        const extension = ext.startsWith('.') ? ext : `.${ext}`;
        if (!base.toLowerCase().endsWith(extension.toLowerCase())) {
            base += extension;
        }
    }
    return base;
}

function cleanJunkWords(text) {
    const junkRegexes = [
        /\bdual\s+audio\b/gi,
        /\bhindi-korean\b/gi,
        /\bhindi\b/gi,
        /\benglish\b/gi,
        /\bkorean\b/gi,
        /\bmulti\s+audio\b/gi,
        /\bweb-dl\b/gi,
        /\bwebrip\b/gi,
        /\bbluray\b/gi,
        /\bhdtv\b/gi,
        /\bhdr\b/gi,
        /\bx264\b/gi,
        /\bx265\b/gi,
        /\bhevc\b/gi,
        /\b10bit\b/gi,
        /\besub\b/gi,
        /\bsub\b/gi,
        /\bsubtitle[s]?\b/gi,
        /\bseries\b/gi,
        /\bmovie[s]?\b/gi,
        /\bfull\s+movie\b/gi,
        /\borg\b/gi,
        /\boriginal\b/gi,
        /\bdirect\s+link[s]?\b/gi,
        /\blink[s]?\b/gi,
        /\b480p\b/gi,
        /\b720p\b/gi,
        /\b1080p\b/gi,
        /\b2160p\b/gi,
        /\b4k\b/gi
    ];

    let result = text;
    for (const regex of junkRegexes) {
        result = result.replace(regex, '');
    }
    result = result.replace(/[\[\]\(\)\{\}\-\:]/g, ' ');
    return result;
}

/**
 * Send WhatsApp Interactive Single Select List Options (Method 2)
 */
async function sendInteractiveOptions(conn, from, title, bodyText, optionsList, quoted = null, posterUrl = null, footerText = "© DanieWatch Bot") {
    const rows = (optionsList || []).map((opt, idx) => ({
        header: (opt.header || `Option ${idx + 1}`).substring(0, 24),
        title: (opt.title || opt.text || `${idx + 1}`).substring(0, 24),
        description: (opt.description || opt.desc || '').substring(0, 72),
        id: String(opt.id || (idx + 1))
    }));

    const buttonParamsJson = JSON.stringify({
        title: "=� Tap to Select Option",
        sections: [
            {
                title: (title || "Options").substring(0, 24),
                highlight_label: "DanieWatch",
                rows: rows
            }
        ]
    });

    const interactiveMessage = {
        header: { title: (title || "DanieWatch Options").substring(0, 50) },
        body: { text: bodyText },
        footer: { text: footerText },
        nativeFlowMessage: {
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: buttonParamsJson
                }
            ]
        }
    };

    let posterSent = null;
    if (posterUrl && (posterUrl.startsWith('http://') || posterUrl.startsWith('https://'))) {
        try {
            posterSent = await conn.sendMessage(from, { image: { url: posterUrl }, caption: `📥 *${title}*` }, quoted ? { quoted } : {});
        } catch (imgErr) {
            console.error('[InteractiveOptions] Failed to send poster:', imgErr.message);
        }
    }

    try {
        const msg = await conn.sendMessage(from, {
            viewOnceMessage: {
                message: {
                    interactiveMessage
                }
            }
        }, quoted ? { quoted: posterSent || quoted } : {});
        return msg;
    } catch (err) {
        console.error('[InteractiveOptions] Interactive list send failed, falling back to text list:', err.message);
        let fallbackText = `= *${title}*\n\n${bodyText}\n\n`;
        (optionsList || []).forEach((opt, idx) => {
            const idVal = opt.id || (idx + 1);
            fallbackText += `  \`${idVal}\`  *${opt.title || opt.text}* ${opt.description ? `(${opt.description})` : ''}\n`;
        });
        fallbackText += `\n_Reply with the number or tap option to select._`;
        return conn.sendMessage(from, { text: fallbackText }, quoted ? { quoted: posterSent || quoted } : {});
    }
}

// =========================================================================
//  BRANDING REPLACEMENTS  centralized list of piracy/source site names
//  All occurrences in filenames are replaced with "DanieWatch"
// =========================================================================
const BRANDING_REPLACEMENTS = [
    // Movie/streaming piracy sites
    /vegamovies?/gi,
    /rogmovies?/gi,
    /hdhub4u/gi,
    /hdmovie2/gi,
    /filmyzilla/gi,
    /movieverse/gi,
    /moviesflix/gi,
    /extramovies?/gi,
    /worldfree4u/gi,
    /world4ufree/gi,
    /khatrimaza/gi,
    /bolly4u/gi,
    /themoviesflix/gi,
    /cinemavilla/gi,
    /tamilrockers?/gi,
    /jalshamoviez?/gi,
    /hubcloud/gi,
    /gdtot/gi,
    /gdflix/gi,
    /katdrive/gi,
    /katmoviehd/gi,
    /mkvcinemas?/gi,
    /mkvmoviespoint/gi,
    /moviesbaba/gi,
    /9xmovies?/gi,
    /downloadhub/gi,
    /filmywap/gi,
    /skymovieshd/gi,
    /coolmoviez/gi,
    /mp4moviez/gi,
    /7starhd/gi,
    /afilmywap/gi,
    /sdmoviespoint/gi,
    /fullmaza/gi,
    /ssrmovies/gi,
    /ofilmywap/gi,
    /moviemad/gi,
    /hubdrive/gi,
    /nexdrive/gi,
    /filebee/gi,
    /fastdl/gi,
    /vgmlink/gi,
    /mlwbd/gi,
    /mlsbd/gi,
    /hdmovieshub/gi,
    /torrentmovies?/gi,
];

function applyBranding(text) {
    if (!text) return text;
    let result = text;
    for (const regex of BRANDING_REPLACEMENTS) {
        result = result.replace(regex, 'DanieWatch');
    }
    // Collapse multiple consecutive "DanieWatch" from adjacent pattern matches
    result = result.replace(/(DanieWatch[\s._\-]*){2,}/gi, 'DanieWatch');
    return result;
}

function generateCustomFileName(state, primaryHost) {
    let postTitle = state.title || '';
    const resolution = state.selectedResolution || '';
    let episode = primaryHost ? primaryHost.episode : '';

    // Sanitize episode  reject disclaimers that got misidentified as episode labels
    if (episode && /download\s+manager|instant\s+download|note\s*:/i.test(episode)) {
        console.log(`[DanieFileName] Rejecting junk episode label: "${episode}"`);
        episode = '';
    }

    console.log(`[DanieFileName] Input: title="${postTitle}", resolution="${resolution}", episode="${episode}"`);

    // Remove "Download" from start
    postTitle = postTitle.replace(/^download\s+/i, '').trim();

    // Remove common disclaimer/note prefixes
    postTitle = postTitle.replace(/note\s*[:\-]\s*use\s+download\s+manager.*?instant\s+download[!.\s]*/gi, '').trim();

    // Determine if it is a TV show
    const hasEpisode = !!episode;
    const isTvShow = hasEpisode || /season\s*\d+|series/i.test(postTitle);

    let cleanTitle = '';

    if (isTvShow) {
        // Keep everything up to and including "Season N" or "Season N - M" (with optional parentheses)
        const seasonMatch = postTitle.match(/^(.*?\(?\s*season\s*\d+(?:\s*[-]\s*\d+)?\s*\)?)/i);
        if (seasonMatch) {
            cleanTitle = seasonMatch[1].trim();
        } else {
            // No season found  use full title
            cleanTitle = postTitle;
        }
    } else {
        // Keep everything up to and including the year (with optional parentheses)
        const yearMatch = postTitle.match(/^(.*?\(?\s*\b(19|20)\d{2}\b\s*\)?)/i);
        if (yearMatch) {
            cleanTitle = yearMatch[1].trim();
        } else {
            // No year found  use full title
            cleanTitle = postTitle;
        }
    }

    // Remove invalid filename characters
    cleanTitle = cleanTitle.replace(/[:*?"<>|\\\/]/g, '').trim();
    cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

    // Build final name: [Episode] Title Resolution
    const parts = [];
    if (episode) {
        parts.push(episode.trim());
    }
    parts.push(cleanTitle);
    if (resolution) {
        parts.push(resolution.trim());
    }

    const result = parts.join(' ');
    console.log(`[DanieFileName] Output: "${result}"`);
    return result;
}

const { execSync, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

let _activeKeepAliveTimer = null;

function startSocketKeepAlive(conn) {
    stopSocketKeepAlive();
    const socket = conn || _connInstance;
    if (!socket) return;
    console.log('[DanieWatch] = Active task started: Enabling 30s WhatsApp socket keep-alive ping...');
    _activeKeepAliveTimer = setInterval(async () => {
        try {
            const activeConn = conn || _connInstance;
            if (activeConn && activeConn.ws && activeConn.ws.readyState === 1) {
                if (typeof activeConn.sendPresenceUpdate === 'function') {
                    await activeConn.sendPresenceUpdate('available');
                }
            } else {
                console.warn('[DanieWatch] Keep-alive ping: WhatsApp socket is not currently OPEN (readyState != 1)');
            }
        } catch (err) {
            console.warn('[DanieWatch] Keep-alive ping warning:', err.message);
        }
    }, 30000);
}

function stopSocketKeepAlive() {
    if (_activeKeepAliveTimer) {
        clearInterval(_activeKeepAliveTimer);
        _activeKeepAliveTimer = null;
        console.log('[DanieWatch] ⏹ Active task ended: Stopped WhatsApp socket keep-alive ping.');
    }
}

async function waitForConnectionReady(conn, maxWaitMs = 15000) {
    const activeConn = conn || _connInstance;
    if (!activeConn) return false;
    
    // If activeConn has no tracked ws object, or ws.readyState is 1 (OPEN) or undefined, socket is ready
    if (!activeConn.ws || activeConn.ws.readyState === 1 || activeConn.ws.readyState === undefined) {
        return true;
    }
    
    console.log(`[DanieWatch] ⏳ WhatsApp WebSocket state is ${activeConn.ws.readyState}. Waiting up to ${maxWaitMs / 1000}s for reconnection...`);
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, 1000));
        const currentConn = conn || _connInstance;
        if (currentConn && (!currentConn.ws || currentConn.ws.readyState === 1 || currentConn.ws.readyState === undefined)) {
            console.log('[DanieWatch]  WhatsApp WebSocket re-connected and ready!');
            return true;
        }
    }
    console.warn('[DanieWatch]  Timeout waiting for WebSocket reconnection. Attempting upload anyway...');
    return false;
}

function getFFmpegPath() {
    try {
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
            return ffmpegInstaller.path;
        }
    } catch (_) {}
    return 'ffmpeg';
}

async function remuxFileToFaststart(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const tmpFixed = filePath + '.fixed.mp4';
    const ffmpegBin = getFFmpegPath();
    const binStr = JSON.stringify(ffmpegBin);
    const inStr = JSON.stringify(filePath);
    const outStr = JSON.stringify(tmpFixed);

    // 1. First attempt: Stream copy with faststart (+faststart moov atom relocation)
    try {
        const cmdCopy = `${binStr} -y -i ${inStr} -c copy -movflags +faststart ${outStr}`;
        await execAsync(cmdCopy, { maxBuffer: 1024 * 1024 * 50 });
        if (fs.existsSync(tmpFixed) && fs.statSync(tmpFixed).size > 0) {
            fs.copyFileSync(tmpFixed, filePath);
            console.log(`[DanieDownload]  Faststart MP4 remux applied to: ${filePath}`);
            return true;
        }
    } catch (copyErr) {
        console.warn(`[DanieDownload] Fast copy remux failed for ${filePath} (${copyErr.message}). Re-encoding to H.264/AAC for WhatsApp compatibility...`);
    } finally {
        try { if (fs.existsSync(tmpFixed)) fs.unlinkSync(tmpFixed); } catch (_) {}
    }

    // 2. Second attempt: Re-encode video to H.264 (yuv420p) and audio to AAC for 100% WhatsApp video playback support
    try {
        const cmdEncode = `${binStr} -y -i ${inStr} -c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ${outStr}`;
        await execAsync(cmdEncode, { maxBuffer: 1024 * 1024 * 50 });
        if (fs.existsSync(tmpFixed) && fs.statSync(tmpFixed).size > 0) {
            fs.copyFileSync(tmpFixed, filePath);
            console.log(`[DanieDownload]  WhatsApp H.264/AAC video re-encode applied to: ${filePath}`);
            return true;
        }
    } catch (encodeErr) {
        console.error(`[DanieDownload] R FFmpeg video re-encode failed for ${filePath}:`, encodeErr.message);
    } finally {
        try { if (fs.existsSync(tmpFixed)) fs.unlinkSync(tmpFixed); } catch (_) {}
    }

    return false;
}

async function compressToJpegThumbnail(buf) {
    if (!buf || !Buffer.isBuffer(buf)) return null;
    try {
        const sharp = require('sharp');
        const resized = await sharp(buf)
            .resize(320, 180, { fit: 'cover' })
            .jpeg({ quality: 60 })
            .toBuffer();
        return resized;
    } catch (_) {
        return buf;
    }
}

function generateVideoThumbnailBuffer(videoPath) {
    if (!videoPath || !fs.existsSync(videoPath)) return null;
    const tmpThumb = videoPath + '.thumb.jpg';
    const ffmpegBin = getFFmpegPath();
    const binStr = JSON.stringify(ffmpegBin);
    const inStr = JSON.stringify(videoPath);
    const outStr = JSON.stringify(tmpThumb);

    try {
        const cmd = `${binStr} -y -i ${inStr} -ss 00:00:01 -vframes 1 -s 320x180 -f image2 ${outStr}`;
        execSync(cmd, { stdio: 'ignore' });
        if (fs.existsSync(tmpThumb) && fs.statSync(tmpThumb).size > 0) {
            const buf = fs.readFileSync(tmpThumb);
            return buf;
        }
    } catch (_) {
        try {
            const cmd0 = `${binStr} -y -i ${inStr} -ss 00:00:00 -vframes 1 -s 320x180 -f image2 ${outStr}`;
            execSync(cmd0, { stdio: 'ignore' });
            if (fs.existsSync(tmpThumb) && fs.statSync(tmpThumb).size > 0) {
                const buf = fs.readFileSync(tmpThumb);
                return buf;
            }
        } catch (_) {}
    } finally {
        try { if (fs.existsSync(tmpThumb)) fs.unlinkSync(tmpThumb); } catch (_) {}
    }
    return null;
}

async function extractArchive(archivePath, targetDir, hintExtOrFilename = '', abortSignal = null) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    let ext = path.extname(archivePath).toLowerCase();
    if ((!ext || ext === '.') && hintExtOrFilename) {
        const hintExt = path.extname(hintExtOrFilename).toLowerCase();
        ext = hintExt || (hintExtOrFilename.startsWith('.') ? hintExtOrFilename.toLowerCase() : '.' + hintExtOrFilename.toLowerCase());
    }

    const fileSize = fs.existsSync(archivePath) ? fs.statSync(archivePath).size : 0;
    const TWO_GIB = 2 * 1024 * 1024 * 1024;
    const combinedName = (path.basename(archivePath) + ' ' + (hintExtOrFilename || '')).toLowerCase();

    const isZip = ext === '.zip' || combinedName.includes('.zip');
    const isRar = ext === '.rar' || ext === '.rar5' || combinedName.includes('.rar');
    const is7zOrOther = ['.7z', '.tar', '.gz', '.tgz', '.z01', '.001', '.iso', '.wim'].includes(ext) || 
                        combinedName.includes('.7z') || combinedName.includes('.tar') || combinedName.includes('.gz');

    // 10 minutes timeout for extraction to prevent infinite hangs on corrupted archives
    const EXTRACT_TIMEOUT_MS = 10 * 60 * 1000;
    const execOpts = { maxBuffer: 1024 * 1024 * 50, timeout: EXTRACT_TIMEOUT_MS };

    console.log(`[DanieDownload] Extracting archive: "${path.basename(archivePath)}" (detected ext: "${ext}", size: ${(fileSize / 1024 / 1024).toFixed(1)} MB, timeout: ${EXTRACT_TIMEOUT_MS / 1000}s)...`);

    // Helper: wrap extraction in abort-aware promise
    const extractWithAbort = (extractionPromise) => {
        if (!abortSignal) return extractionPromise;
        return Promise.race([
            extractionPromise,
            new Promise((_, reject) => {
                if (abortSignal.aborted) return reject(new Error('Aborted'));
                abortSignal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            })
        ]);
    };

    // 1. ZIP Extraction
    if (isZip) {
        try {
            console.log('[DanieDownload] Extracting ZIP via native system unzip...');
            await extractWithAbort(execAsync(`unzip -o -q "${archivePath}" -d "${targetDir}"`, execOpts));
            return true;
        } catch (unzipErr) {
            if (unzipErr.message === 'Aborted') throw unzipErr;
            if (unzipErr.killed) throw new Error(`ZIP extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
            console.warn('[DanieDownload] Native system unzip unavailable or failed, trying 7z...');
            try {
                await extractWithAbort(execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, execOpts));
                return true;
            } catch (err7z) {
                if (err7z.message === 'Aborted') throw err7z;
                if (err7z.killed) throw new Error(`ZIP extraction (7z) timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
                if (fileSize < TWO_GIB) {
                    try {
                        console.log('[DanieDownload] 7z unavailable, falling back to adm-zip...');
                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(archivePath);
                        zip.extractAllTo(targetDir, true);
                        return true;
                    } catch (admErr) {
                        console.error('[DanieDownload] All ZIP extraction methods failed:', admErr.message);
                    }
                }
                throw new Error(`Failed to extract ZIP archive. Error: ${unzipErr.message}`);
            }
        }
    }

    // 2. RAR Extraction
    if (isRar) {
        try {
            console.log('[DanieDownload] Extracting RAR via system unrar...');
            await extractWithAbort(execAsync(`unrar x -o+ "${archivePath}" "${targetDir}/"`, execOpts));
            return true;
        } catch (err) {
            if (err.message === 'Aborted') throw err;
            if (err.killed) throw new Error(`RAR extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
            try {
                console.log('[DanieDownload] System unrar failed, trying 7z (async)...');
                await extractWithAbort(execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, execOpts));
                return true;
            } catch (err7z) {
                if (err7z.message === 'Aborted') throw err7z;
                if (err7z.killed) throw new Error(`RAR extraction (7z) timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
                console.error('[DanieDownload] unrar extraction failed:', err.message);
                throw new Error(`Failed to extract RAR archive. Error: ${err.message}`);
            }
        }
    }

    // 3. 7z / TAR / GZ / Other archives
    if (is7zOrOther) {
        try {
            console.log(`[DanieDownload] Extracting ${ext || 'archive'} via 7z...`);
            await extractWithAbort(execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, execOpts));
            return true;
        } catch (err) {
            if (err.message === 'Aborted') throw err;
            if (err.killed) throw new Error(`${ext} extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
            console.error(`[DanieDownload] 7z extraction failed for ${ext}:`, err.message);
            throw new Error(`Failed to extract ${ext} archive. Error: ${err.message}`);
        }
    }

    // Universal Fallback: Attempt 7z extraction regardless of extension
    try {
        console.log(`[DanieDownload] Attempting universal 7z extraction for unknown format "${ext}"...`);
        await extractWithAbort(execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, execOpts));
        return true;
    } catch (univErr) {
        if (univErr.message === 'Aborted') throw univErr;
        if (univErr.killed) throw new Error(`Archive extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s. Archive may be corrupted or too large.`);
        // Fallback for zip files without extension
        if (fileSize < TWO_GIB) {
            try {
                console.log('[DanieDownload] Universal 7z failed, trying adm-zip fallback...');
                const AdmZip = require('adm-zip');
                const zip = new AdmZip(archivePath);
                zip.extractAllTo(targetDir, true);
                return true;
            } catch (_) {}
        }
        throw new Error(`Unsupported or corrupted archive format: "${ext || path.basename(archivePath)}". Only .zip, .rar, .7z are supported.`);
    }
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
        } else {
            arrayOfFiles.push(filePath);
        }
    });

    return arrayOfFiles;
}

// =========================================================================
//  SETTINGS PERSISTENCE  saves to session/download_settings.json
// =========================================================================
const SETTINGS_PATH = path.join(__dirname, '..', '..', 'session', 'download_settings.json');


// Track which private JIDs have had their Signal session primed this bot session.
// Once a text primer succeeds for a JID, we don't need to prime it again until restart.
const _primedSessions = new Set();
const pendingGroupConfirmations = new Map();

async function sendAndForwardFile(conn, targets, filePayload, sendOptions = {}) {
    if (sendOptions.abortSignal && sendOptions.abortSignal.aborted) {
        throw new Error('Aborted');
    }
    let targetList = [];
    if (Array.isArray(targets) && targets.length > 0) {
        targetList = targets.map(t => {
            const raw = typeof t === 'string' ? t : (t?.jid || '');
            return cleanJid(raw);
        }).filter(Boolean);
    }
    if (targetList.length === 0) {
        targetList = [cleanJid(sendOptions.from || sendOptions.destJid)].filter(Boolean);
    }

    const primaryJid = targetList[0];
    console.log(`[DanieWatch] Uploading file to primary target (${primaryJid})...`);
    await waitForConnectionReady(conn, 15000);

    // --- FIX 1: Session Primer for private JIDs ---
    // Before sending media to a private number, send a tiny text message first.
    // This forces the Signal session to establish cleanly with a lightweight payload
    // before attempting the heavier media upload, preventing silent session corruption.
    const isPrivateJid = primaryJid && primaryJid.endsWith('@s.whatsapp.net');
    if (isPrivateJid && !_primedSessions.has(primaryJid)) {
        try {
            console.log(`[DanieWatch] Priming Signal session for new private target: ${primaryJid}`);
            // Verify the number exists on WhatsApp first
            if (typeof conn.onWhatsApp === 'function') {
                const [exists] = await conn.onWhatsApp(primaryJid.split('@')[0]);
                if (!exists || !exists.exists) {
                    console.error(`[DanieWatch] Target number ${primaryJid} is NOT on WhatsApp! Skipping primer.`);
                }
            }
            // Send a lightweight text primer to establish the Signal session
            const primerMsg = await conn.sendMessage(primaryJid, { text: 'DanieWatch' });
            if (primerMsg && primerMsg.key && primerMsg.key.id) {
                _primedSessions.add(primaryJid);
                console.log(`[DanieWatch] Session primer succeeded for ${primaryJid} (msgId: ${primerMsg.key.id})`);
                // Small delay to let the session ratchet settle
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.warn(`[DanieWatch] Session primer returned no valid key for ${primaryJid}  session may be broken`);
            }
        } catch (primerErr) {
            console.error(`[DanieWatch] Session primer FAILED for ${primaryJid}:`, primerErr.message);
            // If the primer itself fails, the media send will almost certainly fail too.
            // Fall back to the sender's own chat immediately.
            const senderFallback = cleanJid(sendOptions.senderJid || '');
            if (senderFallback && senderFallback !== primaryJid) {
                console.log(`[DanieWatch] Primer failed. Falling back to sender chat: ${senderFallback}`);
                try {
                    const fbMsg = await conn.sendMessage(senderFallback, filePayload, sendOptions.quoted ? { quoted: sendOptions.quoted } : {});
                    return fbMsg;
                } catch (fbErr) {
                    console.error(`[DanieWatch] Fallback to sender also failed:`, fbErr.message);
                }
            }
        }
    }
    
    // --- FIX 2: Send media with silent-failure detection + connection recovery ---
    let sentMsg = null;
    const maxUploadAttempts = 5;
    for (let attempt = 1; attempt <= maxUploadAttempts; attempt++) {
        if (sendOptions.abortSignal && sendOptions.abortSignal.aborted) {
            throw new Error('Aborted');
        }
        try {
            sentMsg = await conn.sendMessage(primaryJid, filePayload, sendOptions.quoted ? { quoted: sendOptions.quoted } : {});
            
            // Verify the response has a valid message key  if not, it may be a silent failure
            if (!sentMsg || !sentMsg.key || !sentMsg.key.id) {
                console.warn(`[DanieWatch] Upload attempt ${attempt}: sendMessage returned no valid key (silent failure). Retrying...`);
                sentMsg = null;
                if (attempt < maxUploadAttempts) {
                    await new Promise(r => setTimeout(r, attempt * 5000));
                    continue;
                }
            } else {
                console.log(`[DanieWatch] Upload succeeded for ${primaryJid} (msgId: ${sentMsg.key.id})`);
                break;
            }
        } catch (uploadErr) {
            const errMsg = uploadErr.message || '';
            if (errMsg === 'Aborted' || (sendOptions.abortSignal && sendOptions.abortSignal.aborted)) {
                throw new Error('Aborted');
            }
            const isConnectionError = errMsg.includes('Connection Closed') || errMsg.includes('Connection was lost') || errMsg.includes('Timed Out') || (uploadErr.output && uploadErr.output.statusCode === 408);
            console.error(`[DanieWatch] Upload attempt ${attempt}/${maxUploadAttempts} failed for ${primaryJid}:`, errMsg);
            if (attempt < maxUploadAttempts) {
                // Wait longer for connection errors to allow Baileys to fully reconnect
                const delayMs = isConnectionError ? 20000 : attempt * 5000;
                console.log(`[DanieWatch] ${isConnectionError ? '⏳ Connection lost  waiting 20s for reconnection...' : `Retrying upload in ${delayMs / 1000}s...`}`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }

    // --- FIX 3: Fallback using senderJid (not LID-based 'from') ---
    // If all attempts failed, fall back to the sender's own chat.
    // Use sendOptions.senderJid (the real @s.whatsapp.net JID) instead of
    // sendOptions.from (which can be a LID like "17064693616661@lid"  bogus JID).
    if (!sentMsg || !sentMsg.key) {
        const fallbackJid = cleanJid(sendOptions.senderJid || sendOptions.from || '');
        if (fallbackJid && fallbackJid !== primaryJid) {
            console.log(`[DanieWatch] All upload attempts failed. Falling back to sender chat: ${fallbackJid}`);
            try {
                sentMsg = await conn.sendMessage(fallbackJid, filePayload, sendOptions.quoted ? { quoted: sendOptions.quoted } : {});
                if (sentMsg && sentMsg.key) {
                    console.log(`[DanieWatch] Fallback upload succeeded to ${fallbackJid}`);
                }
            } catch (fbErr) {
                console.error(`[DanieWatch] Fallback upload to ${fallbackJid} also failed:`, fbErr.message);
            }
        }
        if (!sentMsg || !sentMsg.key) {
            throw new Error(`Failed to upload file to ${primaryJid} after ${maxUploadAttempts} attempts`);
        }
    }

    // Forward to additional targets
    if (targetList.length > 1 && sentMsg && sentMsg.key) {
        for (let i = 1; i < targetList.length; i++) {
            const nextJid = targetList[i];
            try {
                console.log(`[DanieWatch] Forwarding uploaded media to target ${i + 1}/${targetList.length}: ${nextJid}`);
                // Prime secondary private targets too
                if (nextJid.endsWith('@s.whatsapp.net') && !_primedSessions.has(nextJid)) {
                    try {
                        await conn.sendMessage(nextJid, { text: 'DanieWatch' });
                        _primedSessions.add(nextJid);
                        await new Promise(r => setTimeout(r, 1500));
                    } catch (_) {}
                }
                if (typeof conn.forwardMessage === 'function') {
                    await conn.forwardMessage(nextJid, sentMsg, { forceForward: true });
                } else if (conn.sendMessage) {
                    await conn.sendMessage(nextJid, { forward: sentMsg });
                }
            } catch (fwdErr) {
                console.error(`[DanieWatch] Failed to forward to target ${nextJid}:`, fwdErr.message);
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return sentMsg;
}

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            if (!settings.targets) settings.targets = [];
            return settings;
        }
    } catch (err) {
        console.error('[DanieDownload] Failed to load settings:', err.message);
    }
    return { mode: 'private', targets: [], groupJid: '', groupName: '', privateJid: '', privateName: '' };
}

function saveSettings(settings) {
    try {
        const dir = path.dirname(SETTINGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
        console.log('[DanieDownload] Settings saved:', settings);
    } catch (err) {
        console.error('[DanieDownload] Failed to save settings:', err.message);
    }
}

function getActiveTargetsAndPrimary(settings, senderJid) {
    let activeTargets = [];
    if (settings && settings.targets && Array.isArray(settings.targets) && settings.targets.length > 0) {
        activeTargets = settings.targets;
    } else if (settings && settings.mode === 'group' && settings.groupJid) {
        activeTargets = [{ jid: cleanJid(settings.groupJid), name: settings.groupName || 'Group', type: 'group' }];
    } else if (settings && settings.mode === 'private' && settings.privateJid) {
        activeTargets = [{ jid: cleanJid(settings.privateJid), name: settings.privateName || `+${cleanJid(settings.privateJid).split('@')[0]}`, type: 'private' }];
    } else {
        const cleanSend = cleanJid(senderJid);
        activeTargets = [{ jid: cleanSend, name: 'You (Private Chat)', type: 'private' }];
    }

    const primaryTarget = activeTargets[0];
    const primaryJid = cleanJid(primaryTarget.jid);

    let destLabel = '';
    if (activeTargets.length === 1) {
        const icon = primaryTarget.type === 'group' ? '= Group' : '= Private Chat';
        destLabel = `${icon}: *${primaryTarget.name}* (${primaryJid})`;
    } else {
        destLabel = `${activeTargets.length} target receiver(s) (${activeTargets.map(t => t.name).join(', ')})`;
    }

    return { activeTargets, primaryJid, primaryTarget, destLabel };
}

async function downloadFileWithResume(url, tempFilePath, customHeaders = {}, abortSignal = null) {
    const parsedUrl = new URL(url);
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Upgrade-Insecure-Requests': '1',
        'Referer': parsedUrl.origin + '/',
        'Origin': parsedUrl.origin
    };
    const headers = { ...defaultHeaders, ...customHeaders };

    // Pre-signed S3/R2/cloud storage URLs reject browser-impersonation headers (Sec-Fetch-*, Origin, etc.)
    // Strip them to avoid HTTP 400 errors from Cloudflare R2, AWS S3, Backblaze B2, etc.
    const isPresignedCloud = /X-Amz-Signature=/i.test(url) ||
                             /cloudflarestorage\.com/i.test(parsedUrl.hostname) ||
                             /\.r2\.dev/i.test(parsedUrl.hostname) ||
                             /s3[\.\-].*amazonaws\.com/i.test(parsedUrl.hostname) ||
                             /storage\.googleapis\.com/i.test(parsedUrl.hostname) ||
                             /\.backblazeb2\.com/i.test(parsedUrl.hostname);
    if (isPresignedCloud) {
        delete headers['Sec-Ch-Ua'];
        delete headers['Sec-Ch-Ua-Mobile'];
        delete headers['Sec-Ch-Ua-Platform'];
        delete headers['Sec-Fetch-Dest'];
        delete headers['Sec-Fetch-Mode'];
        delete headers['Sec-Fetch-Site'];
        delete headers['Upgrade-Insecure-Requests'];
        delete headers['Origin'];
        delete headers['Referer'];
        headers['Accept'] = '*/*';
        console.log('[DanieDownload] Pre-signed cloud URL detected — stripped browser-specific headers to avoid 400 errors.');
    }

    if (parsedUrl.hostname.includes('pixeldrain.com') && process.env.PIXELDRAIN_API_KEY) {
        headers['Authorization'] = 'Basic ' + Buffer.from(':' + process.env.PIXELDRAIN_API_KEY.trim()).toString('base64');
    }

    let downloadedBytes = 0;
    let attempts = 0;
    const maxAttempts = 3;

    if (fs.existsSync(tempFilePath)) {
        try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
    }

    while (attempts < maxAttempts) {
        attempts++;
        let writer = null;
        try {
            const requestHeaders = { ...headers };
            if (downloadedBytes > 0) {
                requestHeaders['Range'] = `bytes=${downloadedBytes}-`;
                writer = fs.createWriteStream(tempFilePath, { flags: 'a' });
                console.log(`[DanieDownload] Attempt ${attempts}: Resuming download from byte ${downloadedBytes}`);
            } else {
                writer = fs.createWriteStream(tempFilePath);
                console.log(`[DanieDownload] Attempt ${attempts}: Starting download`);
            }

            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                headers: requestHeaders,
                httpsAgent: browserHttpsAgent,
                timeout: 300000 // 5 minutes timeout per connection attempt
            });

            const status = response.status;
            if (downloadedBytes > 0 && status !== 206) {
                console.log(`[DanieDownload] Server returned status ${status} instead of 206. Restarting download.`);
                writer.end();
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                writer = fs.createWriteStream(tempFilePath);
                downloadedBytes = 0;
            }

            response.data.pipe(writer);

            let streamError = null;
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', (err) => {
                    streamError = err;
                    reject(err);
                });
                response.data.on('error', (err) => {
                    streamError = err;
                    reject(err);
                });
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    // Check abort signal on every chunk to immediately stop download on cancel
                    if (abortSignal && abortSignal.aborted) {
                        response.data.destroy();
                        writer.destroy();
                        reject(new Error('Aborted'));
                    }
                });
                if (abortSignal) {
                    if (abortSignal.aborted) {
                        response.data.destroy();
                        writer.destroy();
                        return reject(new Error('Aborted'));
                    }
                    abortSignal.addEventListener('abort', () => {
                        response.data.destroy();
                        writer.destroy();
                        reject(new Error('Aborted'));
                    }, { once: true });
                }
            });

            if (!streamError) {
                console.log(`[DanieDownload] Download completed. Total bytes: ${downloadedBytes}`);
                // Reject suspiciously small files (likely HTML error pages, not video/audio)
                if (downloadedBytes < 5000) {
                    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                    throw new Error(`Downloaded file too small (${downloadedBytes} bytes) - likely an error page`);
                }
                // Inspect content to verify it is not an HTML error page or Cloudflare challenge
                if (fs.existsSync(tempFilePath)) {
                    const fileSize = fs.statSync(tempFilePath).size;
                    const resContentType = (response.headers && response.headers['content-type']) || '';
                    if (fileSize < 1000000 || resContentType.includes('text/html')) { // Check files under 1MB or text/html responses
                        try {
                            const fd = fs.openSync(tempFilePath, 'r');
                            const sampleBuf = Buffer.alloc(Math.min(fileSize, 2048));
                            fs.readSync(fd, sampleBuf, 0, sampleBuf.length, 0);
                            fs.closeSync(fd);
                            const sampleStr = sampleBuf.toString('utf8').toLowerCase();
                            if (sampleStr.includes('<!doctype') || sampleStr.includes('<html') || sampleStr.includes('<head') || sampleStr.includes('access denied') || sampleStr.includes('just a moment...') || sampleStr.includes('cloudflare') || sampleStr.includes('404 not found') || sampleStr.includes('403 forbidden') || sampleStr.includes('502 bad gateway')) {
                                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                                throw new Error(`Downloaded file is an HTML error page (${fileSize} bytes), not valid media.`);
                            }
                        } catch (inspectErr) {
                            if (inspectErr.message.includes('HTML error page')) throw inspectErr;
                        }
                    }
                }
                return response.headers; // success!
            }
        } catch (err) {
            if (err.message === 'Aborted') {
                if (writer) writer.destroy();
                throw err;
            }
            if (writer) writer.destroy();

            // Fast fail if HTTP 404 (Not Found) or 410 (Gone) - file deleted/missing on host
            const statusCode = err.response?.status;
            if (statusCode === 404 || statusCode === 410) {
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                throw new Error(`File not found on host (HTTP ${statusCode}). The file may have been deleted, removed, or the link has expired.`);
            }

            console.error(`[DanieDownload] Attempt ${attempts} failed:`, err.message);

            if (attempts >= maxAttempts) {
                throw new Error(`Download failed after ${maxAttempts} attempts. Error: ${err.message}`);
            }
            
            // Wait 2 seconds before retry
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// =========================================================================
//  IN-MEMORY STATE & DIRECT COMMAND HANDLER
//  Bypasses the obfuscated framework's command dispatch entirely.
//  All DanieWatch commands are handled here via raw messages.upsert.
// =========================================================================
function cleanJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    const parts = jid.split('@');
    const user = parts[0].split(':')[0];
    let server = parts[1] || 's.whatsapp.net';
    if (server === 'c.us') {
        server = 's.whatsapp.net';
    }
    return `${user}@${server}`;
}

function isLandingUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('vcloud') || 
           lower.includes('hubdrive') ||
           lower.includes('hubcdn') ||
           lower.includes('gadgetsweb') ||
           lower.includes('katdrive') ||
           lower.includes('kmhd') ||
           lower.includes('gdflix') || 
           lower.includes('fastdl') || 
           lower.includes('filebee') || 
           lower.includes('nexdrive') ||
           lower.includes('vgmlink') ||
           lower.includes('latent.click');
}

function getQuotedMessageId(mek) {
    const msg = mek?.message;
    if (!msg) return null;
    const contextInfo = msg.extendedTextMessage?.contextInfo || 
                        msg.imageMessage?.contextInfo || 
                        msg.videoMessage?.contextInfo || 
                        msg.documentMessage?.contextInfo ||
                        msg.audioMessage?.contextInfo ||
                        msg.stickerMessage?.contextInfo ||
                        msg.buttonsResponseMessage?.contextInfo ||
                        msg.listResponseMessage?.contextInfo ||
                        msg.templateButtonReplyMessage?.contextInfo ||
                        msg.interactiveResponseMessage?.contextInfo;
    return contextInfo?.stanzaId || null;
}

const pendingConfig = {};
const pendingSearch = {};
const pendingGroupSelection = {};
const pendingHistory = {};
const groupAdminCache = new Map();

// ── Anti-Link/Anti-Spam Kick Cooldown ──
// Prevents rapid kicks: max 1 kick per 60 seconds per group
const _kickCooldown = new Map();
function canKickInGroup(groupJid) {
    const now = Date.now();
    const last = _kickCooldown.get(groupJid) || 0;
    if (now - last < 60000) return false; // 60s cooldown
    _kickCooldown.set(groupJid, now);
    return true;
}

async function checkIsGroupAdmin(conn, groupJid, senderJid) {
    if (!senderJid || !groupJid) return false;
    const cleanSender = senderJid.split('@')[0].split(':')[0].trim();

    // Bot Owner is always immune
    if (cleanSender === '923013068663') return true;

    try {
        const now = Date.now();
        let cached = groupAdminCache.get(groupJid);

        let participantsMap;
        if (cached && (now - cached.timestamp < 60000)) {
            participantsMap = cached.participantsMap;
        } else {
            const metadata = await conn.groupMetadata(groupJid);
            participantsMap = new Map();
            if (metadata && metadata.participants) {
                metadata.participants.forEach(p => {
                    const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
                    participantsMap.set(p.id, isAdm);
                    if (p.lid) participantsMap.set(p.lid, isAdm);
                    const pNum = p.id.split('@')[0].split(':')[0];
                    participantsMap.set(pNum, isAdm);
                });
            }
            groupAdminCache.set(groupJid, { participantsMap, timestamp: now });
        }

        const isAdmin = participantsMap.get(senderJid) || participantsMap.get(cleanSender);
        return !!isAdmin;
    } catch (err) {
        console.error(`[AdminCheck] Error checking admin status for ${senderJid} in ${groupJid}:`, err.message);
        return false;
    }
}

const VEGAMOVIES_DOMAIN = getDomain('vegamovies');
const ROGMOVIES_DOMAIN = getDomain('rogmovies');
const HDHUB4U_DOMAIN = process.env.HDHUB4U_DOMAIN || 'https://new3.hdhub4u.cl';
const pendingDomainSelection = {};

// =========================================================================
//  TASK QUEUE MANAGER  Sequential FIFO execution for .p, .d, and searches
// =========================================================================
class TaskQueueManager {
    constructor() {
        this.queue = [];
        this.activeTask = null;
        this.isProcessing = false;
        this._cancelGeneration = 0;  // Incremented on every cancelAll() to guard against race conditions
    }

    add(task) {
        task.id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        task.addedAt = Date.now();

        if (task.isListQue) {
            // Remove any existing pending listque task so only 1 remains at the tail end
            this.queue = this.queue.filter(t => !t.isListQue);
            this.queue.push(task);
        } else {
            // Normal task (.p, .d, etc.): insert BEFORE any pending listque task so listque stays last
            const listQueIdx = this.queue.findIndex(t => t.isListQue);
            if (listQueIdx !== -1) {
                this.queue.splice(listQueIdx, 0, task);
            } else {
                this.queue.push(task);
            }
        }

        console.log(`[QueueManager] Added task "${task.description}" (ID: ${task.id}). Pending count: ${this.queue.length}`);
        
        this.processNext();
        return task;
    }

    async processNext() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const myGeneration = this._cancelGeneration;  // Snapshot: if cancel happens mid-task, generation will differ
        const task = this.queue.shift();
        startSocketKeepAlive(task?.conn);
        
        const controller = new AbortController();
        const ref = { filePath: null };
        this.activeTask = {
            ...task,
            controller,
            ref,
            startedAt: Date.now()
        };

        console.log(`[QueueManager] Processing task: "${task.description}" (ID: ${task.id})`);

        try {
            await task.executeFn(controller.signal, ref);
            console.log(`[QueueManager] Task completed successfully: "${task.description}"`);
        } catch (err) {
            if (err.message === 'Aborted') {
                console.log(`[QueueManager] Task aborted by user: "${task.description}"`);
            } else {
                console.error(`[QueueManager] Task failed with error: "${task.description}" -> ${err.message}`);
            }
        } finally {
            // Only clean up and continue if no cancel happened during this task's execution.
            // If cancelAll() was called, it already reset state — we must NOT re-trigger processNext
            // because that would pick up tasks from a new batch and overlap with new user commands.
            if (this._cancelGeneration === myGeneration) {
                this.activeTask = null;
                this.isProcessing = false;
                if (this.queue.length === 0) {
                    stopSocketKeepAlive();
                }
                setImmediate(() => this.processNext());
            } else {
                console.log(`[QueueManager] Cancel detected during task execution (gen ${myGeneration} -> ${this._cancelGeneration}). Not continuing old chain.`);
            }
        }
    }

    cancelAll(senderJid) {
        // Increment generation so any in-flight processNext() knows it was cancelled
        this._cancelGeneration++;
        const count = this.queue.length;
        this.queue = [];

        let activeAborted = false;
        if (this.activeTask) {
            try {
                this.activeTask.controller.abort();
                if (this.activeTask.ref && this.activeTask.ref.filePath) {
                    const fp = this.activeTask.ref.filePath;
                    if (fs.existsSync(fp)) {
                        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (_) {}
                    }
                }
                activeAborted = true;
            } catch (e) {}
            this.activeTask = null;
        }
        // Reset processing state so new tasks can start fresh
        this.isProcessing = false;
        stopSocketKeepAlive();
        return { count, activeAborted };
    }

    remove(index) {
        const num = parseInt(index, 10);
        if (isNaN(num) || num < 1 || num > this.queue.length) {
            return null;
        }
        const removed = this.queue.splice(num - 1, 1)[0];
        return removed;
    }

    updateCommand(index, newCommandText, conn, mek, from, senderJid, reply) {
        const num = parseInt(index, 10);
        if (isNaN(num) || num < 1 || num > this.queue.length) {
            return { error: `Invalid queue position ${index}. Total pending items in queue: ${this.queue.length}` };
        }

        const trimmed = (newCommandText || '').trim();
        let cmdPart = trimmed;
        if (cmdPart.startsWith(PREFIX)) {
            cmdPart = cmdPart.slice(PREFIX.length).trim();
        }

        const spaceIdx = cmdPart.indexOf(' ');
        const cmdName = spaceIdx !== -1 ? cmdPart.substring(0, spaceIdx).trim().toLowerCase() : cmdPart.toLowerCase();
        const cmdArgs = spaceIdx !== -1 ? cmdPart.substring(spaceIdx + 1).trim() : '';

        if (cmdName === 'p') {
            const executeFn = async (signal, ref) => {
                await pCommandHandler(conn, mek, from, senderJid, cmdArgs, reply, signal, ref);
            };
            const oldTask = this.queue[num - 1];
            this.queue[num - 1] = {
                ...oldTask,
                description: `🎬 TMDB Task: .p ${cmdArgs.substring(0, 40)}...`,
                commandText: trimmed,
                executeFn
            };
            return { success: true, item: this.queue[num - 1] };
        } else if (cmdName === 'd') {
            const executeFn = async (signal, ref) => {
                await downloadCommandHandler(conn, mek, from, senderJid, cmdArgs, reply, signal, ref);
            };
            const oldTask = this.queue[num - 1];
            this.queue[num - 1] = {
                ...oldTask,
                description: `📥 Download Task: .d ${cmdArgs.substring(0, 40)}...`,
                commandText: trimmed,
                executeFn
            };
            return { success: true, item: this.queue[num - 1] };
        } else if (cmdName === 'config') {
            // Allow editing a config_switch task in the queue
            const groupNum = parseInt(cmdArgs, 10);
            if (isNaN(groupNum) || groupNum < 1) {
                return { error: `Invalid group number. Use: .qedit ${index} .config <group_number>` };
            }
            // We can't resolve group name here without async, so store a placeholder
            // The actual group resolution happens at execution time
            const oldTask = this.queue[num - 1];
            const newExecuteFn = async (signal, ref) => {
                // Resolve group at execution time using safeFetchParticipatingGroups
                let groupsObj = {};
                try {
                    groupsObj = await conn.groupFetchAllParticipating();
                } catch (_) {}
                const groups = Object.values(groupsObj).map(g => ({
                    jid: g.id,
                    subject: g.subject || 'Unknown Group'
                }));
                if (groupNum > groups.length) {
                    try { await reply(`❌ Group #${groupNum} not found. Only ${groups.length} group(s) available.`); } catch (_) {}
                    return;
                }
                const chosen = groups[groupNum - 1];
                const chosenJid = chosen.jid.replace(/:.*@/, '@');
                const chosenName = chosen.subject;
                const newSettings = {
                    mode: 'group',
                    groupJid: chosenJid,
                    groupName: chosenName,
                    privateJid: '',
                    privateName: '',
                    targets: [{ jid: chosenJid, name: chosenName, type: 'group' }]
                };
                saveSettings(newSettings);
                console.log(`[QueueManager] Config switch applied (edited): Group → ${chosenName} (${chosenJid})`);
                try {
                    await reply(`✅ *Group switched to:* 👥 *${chosenName}*\n\n_Subsequent tasks will send to this group._`);
                } catch (_) {}
            };
            this.queue[num - 1] = {
                ...oldTask,
                type: 'config_switch',
                description: `🔀 Group Switch → *Group #${groupNum}*`,
                targetGroupName: `Group #${groupNum}`,
                commandText: `.config ${cmdArgs}`,
                executeFn: newExecuteFn
            };
            return { success: true, item: this.queue[num - 1] };
        } else {
            return { error: `Only .p, .d, or .config commands can be updated in queue.` };
        }
    }

    getStatus() {
        // Show current active group target
        let currentGroupStr = '';
        try {
            const curSettings = loadSettings();
            if (curSettings.targets && curSettings.targets.length > 0) {
                const grpTargets = curSettings.targets.filter(t => t.type === 'group');
                if (grpTargets.length > 0) {
                    currentGroupStr = `\n👥 *Active Group:* ${grpTargets.map(t => `*${t.name}*`).join(', ')}`;
                }
            } else if (curSettings.mode === 'group' && curSettings.groupName) {
                currentGroupStr = `\n👥 *Active Group:* *${curSettings.groupName}*`;
            }
        } catch (_) {}

        let activeStr = 'None';
        if (this.activeTask) {
            activeStr = `⚡ *[PROCESSING]* ${this.activeTask.description}`;
            if (this.activeTask.linkUrl) {
                activeStr += `\n       🔗 ${this.activeTask.linkUrl}`;
            }
            if (this.activeTask.targetGroupName) {
                activeStr += `\n       👥 → *${this.activeTask.targetGroupName}*`;
            }
        }

        let pendingStr = 'No pending items in queue.';
        if (this.queue.length > 0) {
            pendingStr = this.queue.map((t, idx) => {
                let line = `  \`${idx + 1}\`   ${t.description}`;
                if (t.linkUrl) {
                    line += `\n       🔗 ${t.linkUrl}`;
                }
                if (t.targetGroupName) {
                    line += `\n       👥 → *${t.targetGroupName}*`;
                }
                return line;
            }).join('\n\n');
        }

        return `📋 *Task Queue Status*${currentGroupStr}\n\n` +
               `*Currently Processing:*\n${activeStr}\n\n` +
               `*Pending in Queue (${this.queue.length}):*\n${pendingStr}\n\n` +
               `_Use \`.c\` to cancel all, \`.qdel <num>\` to remove an item, or \`.qedit <num> <new_cmd>\` to update._`;
    }
}

function getCleanFileNameFromUrl(urlStr) {
    if (!urlStr) return 'Media File';
    try {
        const u = new URL(urlStr);
        const disposition = u.searchParams.get('response-content-disposition');
        if (disposition) {
            const match = disposition.match(/filename=["']?([^"';\n]+)["']?/i);
            if (match && match[1]) {
                let name = decodeURIComponent(match[1].trim());
                return applyBranding(cleanFileName(name));
            }
            let cleanDisp = decodeURIComponent(disposition.trim());
            return applyBranding(cleanFileName(cleanDisp));
        }
        const pathname = u.pathname;
        const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastPart && lastPart.length > 2 && !lastPart.includes('search')) {
            let name = decodeURIComponent(lastPart.trim());
            return applyBranding(cleanFileName(name));
        }
    } catch (_) {}
    return 'Media File';
}

/**
 * Fetches a human-readable title for a URL before adding it to the queue.
 * For TMDB URLs: extracts title from URL slug (instant, no API call).
 * For download links: tries URL path, HEAD Content-Disposition, and HTML <title>.
 * Returns { title, url } where title is the best available name.
 */
async function fetchLinkTitle(rawInput) {
    if (!rawInput) return { title: 'Media File', url: '' };

    // Parse multiple items - use first URL found
    const items = parseQueryToItems(rawInput);
    const firstItem = items[0] || rawInput;
    const { customFilename, url } = parseDownloadItem(firstItem);

    // If user already gave a custom name, use that
    if (customFilename && !customFilename.startsWith('http')) {
        return { title: customFilename, url };
    }

    const targetUrl = url || rawInput.trim();
    if (!targetUrl.startsWith('http')) return { title: rawInput.substring(0, 60), url: targetUrl };

    // TMDB URL: extract title from URL slug (instant, no network)
    const tmdbMatch = targetUrl.match(/themoviedb\.org\/(movie|tv)\/(\d+)(?:[\-/]([^?#]+))?/i);
    if (tmdbMatch) {
        const slug = tmdbMatch[3] || '';
        if (slug) {
            // Convert URL slug "the-dark-knight" -> "The Dark Knight"
            const titleFromSlug = decodeURIComponent(slug)
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase())
                .trim();
            return { title: `🎬 ${titleFromSlug}`, url: targetUrl };
        }
        return { title: `🎬 TMDB #${tmdbMatch[2]} (${tmdbMatch[1]})`, url: targetUrl };
    }

    // Try to extract filename from URL path/params (no network)
    try {
        const parsedUrl = new URL(targetUrl);

        // Check response-content-disposition or filename query param
        const rcdParam = parsedUrl.searchParams.get('response-content-disposition') || parsedUrl.searchParams.get('filename');
        if (rcdParam) {
            const cdMatch = rcdParam.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n"']+)/i)
                         || rcdParam.match(/filename="([^"]+)"/i)
                         || rcdParam.match(/filename=([^;\n"'\s]+)/i)
                         || [null, rcdParam];
            if (cdMatch && cdMatch[1]) {
                const paramName = decodeURIComponent(cdMatch[1].trim());
                if (paramName && paramName.includes('.') && paramName.length > 3) {
                    return { title: cleanFileName(paramName), url: targetUrl };
                }
            }
        }

        // Check URL pathname for recognizable filename
        const urlPath = parsedUrl.pathname;
        const urlFile = urlPath.substring(urlPath.lastIndexOf('/') + 1);
        if (urlFile && urlFile.includes('.') && urlFile.length > 3 && !/^(index|download|d|file|get)\./i.test(urlFile)) {
            return { title: cleanFileName(decodeURIComponent(urlFile)), url: targetUrl };
        }
    } catch (_) {}

    // Lightweight HEAD request to get Content-Disposition filename
    try {
        const parsedHeadUrl = new URL(targetUrl);
        const headResponse = await axios.head(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': parsedHeadUrl.origin + '/'
            },
            httpsAgent: browserHttpsAgent,
            timeout: 8000,
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400
        });
        const headCD = (headResponse.headers && headResponse.headers['content-disposition']) || '';
        if (headCD) {
            const cdMatch = headCD.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n"']+)/i)
                         || headCD.match(/filename="([^"]+)"/i)
                         || headCD.match(/filename=([^;\n"'\s]+)/i);
            if (cdMatch && cdMatch[1]) {
                const headFilename = decodeURIComponent(cdMatch[1].trim());
                if (headFilename && headFilename.length > 1) {
                    return { title: cleanFileName(headFilename), url: targetUrl };
                }
            }
        }
        // Check final redirect URL for filename
        const finalUrl = headResponse.request?.res?.responseUrl || headResponse.config?.url || '';
        if (finalUrl && finalUrl !== targetUrl) {
            try {
                const finalPath = new URL(finalUrl).pathname;
                const finalFile = finalPath.substring(finalPath.lastIndexOf('/') + 1);
                if (finalFile && finalFile.includes('.') && finalFile.length > 3) {
                    return { title: cleanFileName(decodeURIComponent(finalFile)), url: targetUrl };
                }
            } catch (_) {}
        }
    } catch (_) {}

    // Last resort: lightweight GET to read HTML <title> (first 16KB only)
    try {
        const getResponse = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            httpsAgent: browserHttpsAgent,
            timeout: 8000,
            maxRedirects: 5,
            responseType: 'arraybuffer',
            maxContentLength: 16384,  // Only read first 16KB
            validateStatus: (s) => s >= 200 && s < 400
        });
        const htmlSample = Buffer.from(getResponse.data).toString('utf8').substring(0, 16000);
        const titleMatch = htmlSample.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            let pageTitle = titleMatch[1].trim()
                .replace(/\s*[\|\-–—]\s*(Download|Free|Watch|Online|HD|Full|Movie|Series).*/i, '')
                .trim();
            if (pageTitle.length > 3 && pageTitle.length < 120) {
                return { title: pageTitle, url: targetUrl };
            }
        }
    } catch (_) {}

    // Fallback: use domain + path  
    try {
        const u = new URL(targetUrl);
        return { title: `${u.hostname}${u.pathname.substring(0, 30)}`, url: targetUrl };
    } catch (_) {}
    return { title: 'Media File', url: targetUrl };
}

async function sendTmdbPosterAndTrailer(conn, targets, title, mediaType = 'movie', seasonNum = null) {
    try {
        const { fetchTmdbMetadata, fetchTmdbTrailerUrl } = require('../Utils/movie_scraper');
        let cleanSearchTitle = (title || '')
            .replace(/\.(mp4|mkv|avi|webm|mov|3gp|srt|zip|rar|7z)$/i, '')
            .replace(/[-_.]/g, ' ')
            .replace(/\b(480p|720p|1080p|2160p|4k|bluray|web-dl|webrip|danieWatch)\b/gi, '')
            .replace(/S\d+\s*E\d+.*/i, '')
            .replace(/Season\s*\d+.*/i, '')
            .trim();

        if (!cleanSearchTitle) return;

        const tmdb = await fetchTmdbMetadata(cleanSearchTitle, mediaType === 'tv' ? 'tv' : 'movie');
        if (tmdb && (tmdb.posterUrl || tmdb.backdropUrl)) {
            const trailerUrl = await fetchTmdbTrailerUrl(tmdb.tmdbId, tmdb.type || mediaType, tmdb.title, seasonNum);
            let caption = `🎬 *${tmdb.title}*${tmdb.year && tmdb.year !== 'N/A' ? ` (${tmdb.year})` : ''}\n\n`;
            if (tmdb.genres && tmdb.genres !== 'Unknown') caption += `🎭 *Genres:* ${tmdb.genres}\n`;
            if (seasonNum) caption += `🎯 *Season:* Season ${seasonNum}\n`;
            if (tmdb.overview) caption += `📖 *Overview:* ${tmdb.overview.substring(0, 300)}...\n\n`;
            if (trailerUrl) caption += `🍿 *Official Trailer:* ${trailerUrl}`;

            const imgUrl = tmdb.posterUrl || tmdb.backdropUrl;
            const targetList = Array.isArray(targets) && targets.length > 0 ? targets.map(t => typeof t === 'string' ? t : t?.jid).filter(Boolean) : [];
            
            for (const tJid of targetList) {
                try {
                    await conn.sendMessage(tJid, { image: { url: imgUrl }, caption: caption.trim() });
                } catch (e) {
                    console.warn(`[TMDBPoster] Failed to send poster to ${tJid}:`, e.message);
                }
            }
        }
    } catch (err) {
        console.warn('[TMDBPoster] Error sending poster & trailer:', err.message);
    }
}

const globalTaskQueue = new TaskQueueManager();

// =========================================================================
//  GROUP POST TRACKER — tracks which groups received .p posts this session
//  Used by .qlist to send per-group release lists
//  Map<groupJid, Array<{ title, year, season, isSeries, timestamp }>>
// =========================================================================
const _groupPostTracker = new Map();

function trackGroupPost(groupJid, releaseInfo) {
    if (!groupJid || !groupJid.endsWith('@g.us')) return;
    if (!_groupPostTracker.has(groupJid)) {
        _groupPostTracker.set(groupJid, []);
    }
    _groupPostTracker.get(groupJid).push({
        title: releaseInfo.title || 'Unknown',
        year: releaseInfo.year || 'N/A',
        season: releaseInfo.season || null,
        isSeries: !!releaseInfo.isSeries,
        timestamp: Date.now()
    });
}

function clearGroupPostTracker() {
    _groupPostTracker.clear();
}

// =========================================================================
//  GROUP SHORTCUTS — single-letter shortcuts for fast group targeting
//  Usage: .p i <link>  or  .d e <link>
//  The letter is stripped from args and the task targets that specific group
// =========================================================================
const GROUP_SHORTCUTS = {
    'i': { jid: '120363430644087019@g.us', name: 'Indian' },
    'c': { jid: '120363430641048682@g.us', name: 'Cartoons & Anime' },
    'e': { jid: '120363293975939631@g.us', name: 'English' },
    'k': { jid: '120363427775512697@g.us', name: 'Korean & Chinese' },
    'l': { jid: '120363431694190416@g.us', name: 'Latest 2026' }
};

/**
 * Checks if args start with a group shortcut letter.
 * Returns { shortcut: { jid, name }, remainingArgs } or null if no shortcut.
 */
function extractGroupShortcut(args) {
    if (!args || !args.trim()) return null;
    const trimmed = args.trim();
    // Match: single letter followed by a space then the rest
    const match = trimmed.match(/^([a-z])\s+(.+)$/i);
    if (!match) return null;
    const letter = match[1].toLowerCase();
    const remaining = match[2].trim();
    if (GROUP_SHORTCUTS[letter] && remaining) {
        return { shortcut: GROUP_SHORTCUTS[letter], remainingArgs: remaining };
    }
    return null;
}

// Our command prefix
const PREFIX = '.';

// Map of our command names to handler functions (populated after they're defined)
const DANIE_COMMANDS = {};
const ACTIVE_CHATS_PATH = path.join(__dirname, '..', '..', 'session', 'active_chats.json');

let _cachedActiveChats = null;
let _activeChatsFlushTimer = null;

function loadActiveChats() {
    if (_cachedActiveChats) return _cachedActiveChats;
    try {
        if (fs.existsSync(ACTIVE_CHATS_PATH)) {
            _cachedActiveChats = JSON.parse(fs.readFileSync(ACTIVE_CHATS_PATH, 'utf-8'));
            return _cachedActiveChats;
        }
    } catch (e) {
        console.error('[DanieWatch] Failed to load active_chats.json:', e.message);
    }
    _cachedActiveChats = {};
    return _cachedActiveChats;
}

function flushActiveChatsToDisk() {
    if (!_cachedActiveChats) return;
    try {
        const dir = path.dirname(ACTIVE_CHATS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(ACTIVE_CHATS_PATH, JSON.stringify(_cachedActiveChats, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DanieWatch] Failed to save active_chats.json:', e.message);
    }
}

function saveActiveChat(jid, name, notify) {
    if (!jid || typeof jid !== 'string') return;
    if (jid.endsWith('@g.us') || jid.includes('broadcast')) return;
    const clean = cleanJid(jid);
    if (!clean || clean.endsWith('@g.us') || clean.includes('broadcast')) return;

    const chatsMap = loadActiveChats();
    const existing = chatsMap[clean] || {};

    const cleanPhone = clean.split('@')[0];
    let newName = existing.name;
    let newNotify = existing.notify;

    if (name && typeof name === 'string' && name.trim() && name.trim() !== cleanPhone) {
        newName = name.trim();
    }
    if (notify && typeof notify === 'string' && notify.trim() && notify.trim() !== cleanPhone) {
        newNotify = notify.trim();
    }

    if (existing.name === newName && existing.notify === newNotify && (Date.now() - (existing.lastUpdated || 0) < 300000)) {
        return; // Skip if unchanged
    }

    chatsMap[clean] = {
        id: clean,
        name: newName || undefined,
        notify: newNotify || undefined,
        lastUpdated: Date.now()
    };

    if (!_activeChatsFlushTimer) {
        _activeChatsFlushTimer = setTimeout(() => {
            _activeChatsFlushTimer = null;
            flushActiveChatsToDisk();
        }, 5000);
    }
}

function removeActiveChat(jid) {
    if (!jid) return;
    const clean = cleanJid(typeof jid === 'string' ? jid : jid?.id);
    if (!clean) return;

    const chatsMap = loadActiveChats();
    if (chatsMap[clean]) {
        delete chatsMap[clean];
        try {
            const dir = path.dirname(ACTIVE_CHATS_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(ACTIVE_CHATS_PATH, JSON.stringify(chatsMap, null, 2), 'utf-8');
        } catch (e) {}
    }
}

function getAllPrivateChats(conn, cleanSender) {
    const rawChats = [];

    // 1. From saved active_chats.json (captured from live active WhatsApp chat events)
    const saved = loadActiveChats();
    Object.values(saved).forEach(c => rawChats.push(c));

    if (conn) {
        // 2. From conn.chats (active chat threads only)
        if (conn.chats) {
            try {
                const connChats = conn.chats instanceof Map ? Array.from(conn.chats.values()) : Object.values(conn.chats);
                connChats.forEach(c => rawChats.push(c));
            } catch (e) {}
        }

        // 3. From conn.store.chats (active chat threads only)
        if (conn.store && conn.store.chats) {
            try {
                const storeChats = typeof conn.store.chats.all === 'function'
                    ? conn.store.chats.all()
                    : (conn.store.chats instanceof Map ? Array.from(conn.store.chats.values()) : Object.values(conn.store.chats));
                storeChats.forEach(c => rawChats.push(c));
            } catch (e) {}
        }
    }

    // Deduplicate and filter out groups / broadcasts / LIDs
    const seen = new Set();
    let result = [];

    for (const c of rawChats) {
        if (!c || !c.id) continue;
        if (typeof c.id === 'string' && (c.id.includes('@lid') || c.id.endsWith('@g.us') || c.id.includes('broadcast'))) continue;
        const clean = cleanJid(c.id);
        if (!clean || clean.includes('@lid') || clean.endsWith('@g.us') || clean.includes('broadcast')) continue;

        const phone = clean.split('@')[0];
        // Must be a valid phone number (digits only, length 7 to 15)
        if (!/^\d{7,15}$/.test(phone)) continue;

        const contactName = c.name || c.verifiedName;
        const notifyName = c.notify || c.pushName;

        if (seen.has(clean)) {
            const existingObj = result.find(r => r.id === clean);
            if (existingObj) {
                if (contactName && contactName !== phone) existingObj.name = contactName;
                if (notifyName && notifyName !== phone && !existingObj.name) existingObj.name = notifyName;
            }
            continue;
        }
        seen.add(clean);

        const displayName = (contactName && contactName !== phone) ? contactName : ((notifyName && notifyName !== phone) ? notifyName : phone);
        result.push({
            id: clean,
            name: displayName
        });
    }

    const selfChat = { id: cleanJid(cleanSender), name: 'You (Private Chat)' };
    const otherChats = result.filter(c => c.id !== selfChat.id);

    return [selfChat, ...otherChats];
}

let _danieStartupSent = false;
let _connInstance = null;

const _botSentMessageIds = new Set();

function initUpsertListener(conn) {
    if (conn.danieDownloadUpsertRegistered) return;
    conn.danieDownloadUpsertRegistered = true;
    _connInstance = conn;
    if (!conn._startupTime) conn._startupTime = Date.now();
    if (!conn._connectTimeSeconds) conn._connectTimeSeconds = Math.floor(conn._startupTime / 1000);

    // Install wrapper on conn.sendMessage to record all bot-sent message IDs and prevent self-reply loops
    if (!conn._sendMessageLoopProtectorInstalled) {
        conn._sendMessageLoopProtectorInstalled = true;
        const origSendMessage = conn.sendMessage.bind(conn);
        conn.sendMessage = async function(jid, content, options) {
            const sentMsg = await origSendMessage(jid, content, options);
            if (sentMsg && sentMsg.key && sentMsg.key.id) {
                _botSentMessageIds.add(sentMsg.key.id);
                if (_botSentMessageIds.size > 2000) {
                    const firstKey = _botSentMessageIds.values().next().value;
                    _botSentMessageIds.delete(firstKey);
                }
            }
            return sentMsg;
        };
    }

    // Pre-prime the bot's own JID so we never send a primer message to ourselves
    if (conn.user && conn.user.id) {
        _primedSessions.add(cleanJid(conn.user.id));
    }

    // Listen to WhatsApp sync events to capture active chat threads
    try {
        if (conn.ev) {
            conn.ev.on('chats.delete', (deletedJids) => {
                const arr = Array.isArray(deletedJids) ? deletedJids : [deletedJids];
                for (const j of arr) removeActiveChat(j);
            });
            conn.ev.on('chats.upsert', (chats) => {
                const arr = Array.isArray(chats) ? chats : [chats];
                for (const c of arr) if (c && c.id && !c.read_only) saveActiveChat(c.id, c.name || c.subject, c.notify);
            });
            conn.ev.on('chats.update', (chats) => {
                const arr = Array.isArray(chats) ? chats : [chats];
                for (const c of arr) if (c && c.id && !c.read_only) saveActiveChat(c.id, c.name || c.subject, c.notify);
            });
            conn.ev.on('messaging-history.set', (history) => {
                if (history && history.chats && Array.isArray(history.chats)) {
                    for (const c of history.chats) if (c && c.id && !c.read_only) saveActiveChat(c.id, c.name || c.subject, c.notify);
                }
                if (history && history.messages && Array.isArray(history.messages)) {
                    for (const m of history.messages) if (m && m.key && m.key.remoteJid) saveActiveChat(m.key.remoteJid, null, m.pushName);
                }
            });
        }
    } catch (e) {}

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            if (chatUpdate.type !== 'notify' && chatUpdate.type !== 'append') return;
            const rawMessages = chatUpdate.messages || [];
            if (!rawMessages || rawMessages.length === 0) return;

            for (const mek of rawMessages) {
                if (!mek) continue;

                // Loop Protector: Silently ignore messages generated programmatically by the bot code itself
                if (mek.key && mek.key.id && _botSentMessageIds.has(mek.key.id)) {
                    console.log(`[DanieWatch] 🛡️ Ignored bot's own output message (id: ${mek.key.id}). Self-loop prevented.`);
                    continue;
                }

                let msgTimestamp = 0;
                if (typeof mek.messageTimestamp === 'number') {
                    msgTimestamp = mek.messageTimestamp;
                } else if (typeof mek.messageTimestamp === 'string') {
                    msgTimestamp = parseInt(mek.messageTimestamp, 10) || 0;
                } else if (typeof mek.messageTimestamp === 'bigint') {
                    msgTimestamp = Number(mek.messageTimestamp);
                } else if (mek.messageTimestamp && typeof mek.messageTimestamp.toNumber === 'function') {
                    try { msgTimestamp = mek.messageTimestamp.toNumber(); } catch (_) {}
                } else if (mek.messageTimestamp && typeof mek.messageTimestamp.low === 'number') {
                    msgTimestamp = mek.messageTimestamp.low;
                }

                // Connection timestamp gate: silently drop offline backlog messages
                // sent before the bot connected. This eliminates E2EE catch-up lag and stale queued messages.
                if (conn._connectTimeSeconds && msgTimestamp > 0 && msgTimestamp < (conn._connectTimeSeconds - 5)) {
                    continue;
                }

                const from = mek.key?.remoteJid;
                if (!from) continue;

                let senderJid = mek.key.participant || mek.key.remoteJid;
                if (mek.key.fromMe && conn.user && conn.user.id) {
                    senderJid = conn.user.id;
                }
                const cleanSender = cleanJid(senderJid);

                if (!mek.message) {
                    // ALWAYS log undecryptable messages with full sender info for debugging
                    const undecryptFrom = mek.key?.remoteJid || 'unknown';
                    const undecryptSender = mek.key?.participant || mek.key?.remoteJid || 'unknown';
                    const undecryptFromMe = !!mek.key?.fromMe;
                    console.log(`[DanieWatch] ⚠️ UNDECRYPTABLE message: from="${undecryptFrom}" sender="${undecryptSender}" fromMe=${undecryptFromMe} stubType=${mek.messageStubType || 'none'} id=${mek.key?.id || 'N/A'}`);
                    continue;
                }

                // JID routing: Preserve original 'from' (LID thread, Group, or DM) as primary destination
                // so replies arrive directly in the exact chat thread where the command was typed.
                const targetJid = from || cleanSender;
                let sendableFrom = from;
                if (from && from.includes('@newsletter')) {
                    sendableFrom = cleanSender;
                }

                // Extract body text from all possible message structures
                let groupMsgText = mek.message?.conversation ||
                                   mek.message?.extendedTextMessage?.text ||
                                   mek.message?.imageMessage?.caption ||
                                   mek.message?.videoMessage?.caption ||
                                   mek.message?.documentMessage?.caption ||
                                   mek.message?.buttonsResponseMessage?.selectedButtonId ||
                                   mek.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                                   mek.message?.templateButtonReplyMessage?.selectedId || '';

                if (!groupMsgText && mek.message?.interactiveResponseMessage) {
                    try {
                        const resp = mek.message.interactiveResponseMessage;
                        if (resp.nativeFlowResponseMessage?.paramsJson) {
                            const params = JSON.parse(resp.nativeFlowResponseMessage.paramsJson);
                            groupMsgText = params.id || params.rowId || params.selectedRowId || '';
                        } else if (resp.body?.text) {
                            groupMsgText = resp.body.text;
                        }
                    } catch (_) {}
                }

                // Log EVERY raw message as soon as it is received
                console.log(`[DanieWatch] 📱 Raw message received: from="${from}" sender="${senderJid}" cleanSender="${cleanSender}" targetJid="${targetJid}" fromMe=${!!mek.key.fromMe} text="${groupMsgText.substring(0, 100)}"`);

                // ══════════════════════════════════════════════════════════════════
                //  GROUP MODERATION ENGINE — Anti-Link & Anti-Spam (Runs BEFORE Owner Filter)
                // ══════════════════════════════════════════════════════════════════
                if (from && from.endsWith('@g.us')) {
                    const { isAntilinkActiveForGroup, containsForbiddenLink } = require('../Utils/antilink');
                    const { isAntispamActiveForGroup, recordMessageAndCheckSpam } = require('../Utils/antispam');

                    console.log(`[GroupMsg] 📩 Processing group message in "${from}" from "${senderJid}". Text: "${groupMsgText.substring(0, 80)}"`);

                    // ── 1. Anti-Link Enforcement (single message delete + kick with cooldown) ──
                    if (isAntilinkActiveForGroup(from) && groupMsgText && containsForbiddenLink(groupMsgText)) {
                        console.log(`[AntiLink] ⚡ Forbidden link detected in group ${from} from sender ${senderJid} (fromMe=${!!mek.key.fromMe}). Text: "${groupMsgText.substring(0, 80)}"`);
                        try {
                            const isAdmin = await checkIsGroupAdmin(conn, from, senderJid);
                            if (isAdmin || mek.key.fromMe) {
                                console.log(`[AntiLink] 🛡️ Ignored — Sender ${cleanSender} is Admin, Bot Owner, or self (fromMe=${!!mek.key.fromMe}).`);
                            } else {
                                // Send warning + instant kick
                                try {
                                    await conn.sendMessage(from, {
                                        text: `*Links Allow nahi hain. . . !*\n\n*لنک بھیجنا منع ہے۔*`,
                                        mentions: [senderJid]
                                    });
                                } catch (_) {}
                                try {
                                    await conn.groupParticipantsUpdate(from, [senderJid], 'remove');
                                    console.log(`[AntiLink] 🚪 Instant-kicked ${senderJid} from ${from} for link: "${groupMsgText.substring(0, 60)}"`);
                                } catch (kickErr) {
                                    console.error('[AntiLink] Kick failed:', kickErr.message);
                                }

                                continue; // Stop further processing for this message
                            }
                        } catch (err) {
                            console.error('[AntiLink] Error during enforcement:', err.message);
                        }
                    }

                    // ── 2. Anti-Spam Enforcement (single message delete + kick with cooldown) ──
                    if (isAntispamActiveForGroup(from)) {
                        const spamCheck = recordMessageAndCheckSpam(senderJid, from, mek.key);
                        if (spamCheck.isSpam) {
                            console.log(`[AntiSpam] ⚡ Spam rate threshold exceeded in group ${from} from sender ${senderJid} (${spamCheck.count} msgs/2min).`);
                            try {
                                const isAdmin = await checkIsGroupAdmin(conn, from, senderJid);
                                if (isAdmin || mek.key.fromMe) {
                                    console.log(`[AntiSpam] 🛡️ Ignored — Sender ${cleanSender} is Admin or Owner in ${from}.`);
                                } else {
                                    // Send warning + instant kick (no message deletion)
                                    const senderNum = (senderJid || cleanSender || '').split('@')[0].split(':')[0].trim();
                                    try {
                                        await conn.sendMessage(from, {
                                            text: `⚠️ *@${senderNum}* Too many messages. Slow down.`,
                                            mentions: [senderJid]
                                        });
                                    } catch (_) {}
                                    try {
                                        await conn.groupParticipantsUpdate(from, [senderJid], 'remove');
                                        console.log(`[AntiSpam] 🚪 Kicked ${senderJid} from ${from} (${spamCheck.count} msgs/2min)`);
                                    } catch (kickErr) {
                                        console.error('[AntiSpam] Kick failed:', kickErr.message);
                                    }

                                    continue; // Stop further processing for this message
                                }
                            } catch (err) {
                                console.error('[AntiSpam] Error during enforcement:', err.message);
                            }
                        }
                    }
                }

            // ══════════════════════════════════════════════════════════════════
            //  PASSIVE GROUP SCANNER — Records bot's own posts to target groups
            //  This runs for ALL fromMe group messages BEFORE the owner check.
            // ══════════════════════════════════════════════════════════════════
            if (mek.key.fromMe && from && from.endsWith('@g.us')) {
                try {
                    const { parseMediaCaption, addDailyRelease } = require('../Utils/daily_releases');
                    const settings = loadSettings();
                    // Check if this group is one of the configured target groups
                    const targetJids = [];
                    if (settings.targets && settings.targets.length > 0) {
                        settings.targets.forEach(t => { if (t.jid && t.jid.endsWith('@g.us')) targetJids.push(cleanJid(t.jid)); });
                    } else if (settings.groupJid) {
                        targetJids.push(cleanJid(settings.groupJid));
                    }
                    const cleanFrom = cleanJid(from);
                    if (targetJids.includes(cleanFrom)) {
                        // Extract caption from image/video/document messages
                        const caption = mek.message?.imageMessage?.caption ||
                                        mek.message?.videoMessage?.caption ||
                                        mek.message?.documentMessage?.caption || '';
                        if (caption && caption.length > 5) {
                            const parsed = parseMediaCaption(caption);
                            if (parsed && parsed.title) {
                                addDailyRelease({
                                    title: parsed.title,
                                    year: parsed.year,
                                    season: parsed.season,
                                    isSeries: parsed.isSeries,
                                    groupJid: cleanFrom,
                                    source: 'group_scan'
                                });
                                console.log(`[GroupScan] 📝 Auto-recorded release from group post: "${parsed.title}" (${parsed.year}) ${parsed.season || ''}`);
                            }
                        }
                    }
                } catch (scanErr) {
                    // Silent — don't break message processing for scan errors
                    console.warn('[GroupScan] Error in passive scanner:', scanErr.message);
                }
            }

            // OWNER-ONLY ACCESS CHECK: Block all non-owners from messaging/sending commands to the bot
            if (!mek.key.fromMe && !isOwner(senderJid, mek)) {
                console.log(`[DanieWatch] 🔒 Access denied: Message from non-owner sender ${cleanSender} (JID: ${senderJid}) ignored.`);
                return;
            }

            // Check if current chat is the owner's personal "You" chat (Message Yourself / Own DM)
            const isGroupChat = !!(from && from.endsWith('@g.us'));
            const isOwnerSender = !!(mek.key.fromMe || isOwner(senderJid, mek));

            const cleanFromJid = cleanJid(from);
            const botUserJid = conn.user?.id ? cleanJid(conn.user.id) : '';
            const botLidJid = conn.user?.lid ? cleanJid(conn.user.lid) : '';

            // A chat is considered "You" (own) chat ONLY IF:
            // 1) `from` matches the sender's own JID (Message Yourself / self chat where cleanFromJid === cleanSender), OR
            // 2) `from` matches the connected bot account's user JID or LID, OR
            // 3) `isOwner(cleanFromJid, mek)` is true (the destination chat JID itself belongs to an owner).
            const isSelfChat = !!(
                cleanFromJid &&
                (
                    cleanFromJid === cleanSender ||
                    (botUserJid && cleanFromJid === botUserJid) ||
                    (botLidJid && cleanFromJid === botLidJid) ||
                    isOwner(cleanFromJid, mek)
                )
            );

            const isYouChat = !isGroupChat && isOwnerSender && isSelfChat;

            // Record incoming/outgoing chat JIDs
            if (from) saveActiveChat(from, null, mek.pushName);
            if (senderJid) saveActiveChat(senderJid, null, mek.pushName);

            // Handle Incoming Voice Notes (audioMessage) - COMPLETELY DISABLED
            if (mek.message?.audioMessage) {
                console.log(`[DanieWatch] 🎙️ Ignored incoming Voice Note from ${cleanSender}. Voice note feature is disabled.`);
                return;
            }

            let body = mek.message.conversation ||
                         mek.message.extendedTextMessage?.text ||
                         mek.message.buttonsResponseMessage?.selectedButtonId ||
                         mek.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         mek.message.templateButtonReplyMessage?.selectedId ||
                         '';

            if (!body && mek.message.interactiveResponseMessage) {
                try {
                    const resp = mek.message.interactiveResponseMessage;
                    if (resp.nativeFlowResponseMessage?.paramsJson) {
                        const params = JSON.parse(resp.nativeFlowResponseMessage.paramsJson);
                        body = params.id || params.rowId || params.selectedRowId || '';
                    } else if (resp.body?.text) {
                        body = resp.body.text;
                    }
                } catch (_) {}
            }
            const trimmedText = body.trim();
            if (!trimmedText) return;

            // RESTRICT ALL COMMANDS STRICTLY TO YOU (OWN) CHAT ONLY
            if (!isYouChat) {
                console.log(`[DanieWatch] 🔒 Access restricted: Command/Message "${trimmedText.substring(0, 50)}" ignored in chat "${from}". All commands work strictly in You (own) chat.`);
                return;
            }

            const { applyAntiBanPresence, markAsRead } = require('../Utils/anti_ban');

            // Auto-mark incoming message as read for human presence telemetry
            await markAsRead(conn, mek);

            const reply = async (textMsg) => {
                try {
                    await applyAntiBanPresence(conn, mek, targetJid, 'composing');
                    return await conn.sendMessage(targetJid, { text: textMsg }, { quoted: mek });
                } catch (err1) {
                    if (cleanSender && cleanSender !== targetJid) {
                        try {
                            await applyAntiBanPresence(conn, mek, cleanSender, 'composing');
                            return await conn.sendMessage(cleanSender, { text: textMsg }, { quoted: mek });
                        } catch (err2) {}
                    }
                    throw err1;
                }
            };

            // ---- Handle commands starting with PREFIX ----
            if (trimmedText.startsWith(PREFIX)) {
                // Parse custom command and arguments
                const cmdPart = trimmedText.slice(PREFIX.length).trim();
                const spaceIdx = cmdPart.indexOf(' ');
                const cmdName = spaceIdx !== -1 ? cmdPart.substring(0, spaceIdx).trim().toLowerCase() : cmdPart.toLowerCase();
                const cmdArgs = spaceIdx !== -1 ? cmdPart.substring(spaceIdx + 1).trim() : '';

                const ALLOWED_COMMANDS = [
                    'search', 'aisearch', 'confirm', 'domain', 'domains',
                    'sv', 'sr', 'sh', 'si', 'se', 'seextract', 'serieslinks', 'nexdrive', 'vcloudlinks',
                    'alive', 'allow', 'disallow', 'addowner', 'delowner', 'addsudo', 'delsudo', 'owners', 'allowed', 'sudolist', 'config', 'setgroup', 'dlstatus', 'dlconfig', 'downloadstatus',
                    'c', 'cancel', 'clearqueue', 'cancelall', 'que', 'queue', 'q', 'qstatus',
                    'd', 'p',
                    'jid', 'groupid',
                    'createlist', 'list', 'todaylist', 'todayrelease', 'daily', 'create',
                    'history', 'weeklist', '7days', 'archive',
                    'listque', 'quelist', 'qlist',
                    'qdel', 'qremove', 'qedit', 'qupdate',
                    'help',
                    'song', 'songdl', 'yt1s', 'yts', 'yts1', 'video', 'yt2s', 'yt3s', 'csong', 'csongdl',
                    'ig', 'fb', 'fbdl', 'tiktok', 'twitter', 'insta', 'instagram', 'igdl', 'x', 'xdl', 'ytv', 'yt', 'tk', 'ytm', 'music', 'yta',
                    'mvdl', 'mv', 'movie', 'mvdlinfo', 'mvdlseason', 'mvdlshowep', 'mvdlget', 'mvdlsub',
                    'antilink', 'al', 'linkprotect', 'antispam', 'aspam', 'spamprotect'
                ];

                if (!ALLOWED_COMMANDS.includes(cmdName) && !DANIE_COMMANDS[cmdName]) {
                    console.log(`[DanieWatch] Blocked command not in ALLOWED_COMMANDS: ".${cmdName}" from ${cleanSender}`);
                    if (mek.message.conversation) mek.message.conversation = '';
                    if (mek.message.extendedTextMessage?.text) mek.message.extendedTextMessage.text = '';
                    return;
                }

                console.log(`[DanieWatch] Command detected: "${cmdName}" args: "${cmdArgs}" from ${cleanSender}`);

                // If starting a new search command (.sv, .sr, .sh, .si), reset uncompleted search state for user
                if (['sv', 'sr', 'sh', 'si'].includes(cmdName)) {
                    delete pendingSearch[cleanSender];
                }
                delete pendingConfig[cleanSender];
                delete pendingHistory[cleanSender];

                if (DANIE_COMMANDS[cmdName]) {
                    console.log(`[DanieWatch] Executing command: "${cmdName}"`);
                    
                    // Clear message text to prevent obfuscated framework double-execution
                    if (mek.message.conversation) mek.message.conversation = '';
                    if (mek.message.extendedTextMessage?.text) mek.message.extendedTextMessage.text = '';

                    try {
                        await DANIE_COMMANDS[cmdName](conn, mek, targetJid, senderJid, cmdArgs, reply);
                    } catch (cmdErr) {
                        console.error(`[DanieWatch] Error executing command "${cmdName}":`, cmdErr);
                        try {
                            await reply(`❌ Command execution failed: ${cmdErr.message}`);
                        } catch (_) {}
                    }
                }
                return;
            }

            // ---- Check if it's a reply for pending domain/host priority update ----
            if (pendingDomainSelection[cleanSender]) {
                const parts = trimmedText.trim().split(/\s+/);
                const choice = parts[0];
                const val = parts.slice(1).join(' ');
                if (['1', '2', '3', 'rog', 'rogmovies', 'vega', 'vegamovies', 'host', 'priority'].includes(choice.toLowerCase())) {
                    if (!val) {
                        await reply(`ℹ️ Please send the choice number (1, 2, or 3) followed by the new value.\n\n*Examples:*\n\`1 https://new2.rogmovies.click/\`\n\`3 10gbps, fslv2, fsl\``);
                        return;
                    }
                    const res = setDomain(choice, val);
                    delete pendingDomainSelection[cleanSender];
                    if (res.success) {
                        if (res.hostPriority) {
                            await reply(`✅ *Host Link Priority Updated Successfully!*\n\n• *New Order:* ${res.hostPriority.join(' ➔ ')}\n\n*Saved permanently to bot storage.*`);
                        } else {
                            await reply(`✅ *Domain Updated Successfully!*\n\n• *Site:* ${res.site}\n• *New URL:* \`${res.url}\` \n\n*Saved permanently to bot storage.*`);
                        }
                    } else {
                        await reply(`❌ ${res.error}`);
                    }
                    return;
                }
            }

            // ---- Check if it's a plain-number reply for pending config ----
            if (pendingConfig[cleanSender]) {
                const quotedId = getQuotedMessageId(mek);
                const isMatch = !!(quotedId && pendingConfig[cleanSender].messageId && quotedId === pendingConfig[cleanSender].messageId);
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleConfigReply for ${cleanSender}.`);
                    await handleConfigReply(conn, mek, null, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- Check if it's a reply for pending AI search pre-confirmation ----
            const { pendingPreConfirmations, handlePreConfirmationReply } = require('./ai_search');
            let matchedConfirmKey = null;
            const quotedId = getQuotedMessageId(mek);

            for (const [key, session] of pendingPreConfirmations.entries()) {
                if (session.chatId === targetJid || session.chatId === from) {
                    // STRICT QUOTED-REPLY VERIFICATION: User MUST quote/reply to the bot's prompt message!
                    if (session.messageId && quotedId && quotedId === session.messageId) {
                        matchedConfirmKey = key;
                        break;
                    }
                }
            }

            if (matchedConfirmKey) {
                const lower = trimmedText.toLowerCase();
                if (['yes', 'y', '1', 'confirm', 'ok'].includes(lower)) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handlePreConfirmationReply (APPROVED).`);
                    await handlePreConfirmationReply(conn, mek, matchedConfirmKey, true);
                    return;
                } else if (['no', 'n', 'cancel', '0'].includes(lower)) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handlePreConfirmationReply (CANCELLED).`);
                    await handlePreConfirmationReply(conn, mek, matchedConfirmKey, false);
                    return;
                } else {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handlePreConfirmationReply (SEASON OR TITLE CORRECTION).`);
                    await handlePreConfirmationReply(conn, mek, matchedConfirmKey, null, trimmedText);
                    return;
                }
            }

            // ---- Check if it's a reply for pending search/resolution ----
            if (pendingSearch[cleanSender]) {
                const isInteractiveMsg = !!(mek.message.interactiveResponseMessage || mek.message.buttonsResponseMessage || mek.message.listResponseMessage || mek.message.templateButtonReplyMessage);
                const isMatch = !!(quotedId && pendingSearch[cleanSender].messageId && quotedId === pendingSearch[cleanSender].messageId) || isInteractiveMsg;
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleSearchReply for ${cleanSender}.`);
                    await handleSearchReply(conn, mek, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- Check if it's a reply for pending antilink / antispam group selection ----
            if (pendingGroupSelection[cleanSender]) {
                const isMatch = !!(quotedId && pendingGroupSelection[cleanSender].messageId && quotedId === pendingGroupSelection[cleanSender].messageId);
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleGroupSelectionReply for ${cleanSender}.`);
                    await handleGroupSelectionReply(conn, mek, senderJid, trimmedText, reply);
                    return;
                }
            }

            if (pendingHistory[cleanSender]) {
                const isMatch = !!(quotedId && pendingHistory[cleanSender].messageId && quotedId === pendingHistory[cleanSender].messageId);
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleHistoryReply for ${cleanSender}.`);
                    await handleHistoryReply(conn, mek, from, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- Check if it's a reply for pending group antilink / antispam confirmation ----
            let matchedGroupConfirmKey = null;
            for (const [key, session] of pendingGroupConfirmations.entries()) {
                if (session.chatId === targetJid) {
                    if (session.messageId && quotedId && quotedId === session.messageId) {
                        matchedGroupConfirmKey = key;
                        break;
                    }
                }
            }

            if (matchedGroupConfirmKey) {
                const session = pendingGroupConfirmations.get(matchedGroupConfirmKey);
                pendingGroupConfirmations.delete(matchedGroupConfirmKey);

                const lower = trimmedText.toLowerCase();
                if (['yes', 'y', '1', 'confirm', 'ok', 'haan', 'ha', 'yahi', 'sahi', 'kar do'].includes(lower)) {
                    if (session.mode === 'antilink') {
                        const { addGroupToAntilink, removeGroupFromAntilink } = require('../Utils/antilink');
                        if (session.enable) addGroupToAntilink(session.groupJid);
                        else removeGroupFromAntilink(session.groupJid);
                        await reply(`✅ Anti-Link protection *${session.enable ? 'ENABLED' : 'DISABLED'}* for group *${session.groupName}* (\`${session.groupJid}\`).`);
                    } else if (session.mode === 'antispam') {
                        const { addGroupToAntispam, removeGroupFromAntispam } = require('../Utils/antispam');
                        if (session.enable) addGroupToAntispam(session.groupJid);
                        else removeGroupFromAntispam(session.groupJid);
                        await reply(`✅ Anti-Spam protection *${session.enable ? 'ENABLED' : 'DISABLED'}* for group *${session.groupName}* (\`${session.groupJid}\`).`);
                    }
                    return;
                } else {
                    await reply('❌ Group settings change cancelled.');
                    return;
                }
            }

            // ---- AUTO-URL DETECTOR FOR OWNER (Direct Link Auto-Downloader) ----
            const isBotOutputMessage = mek.key.fromMe && (
                trimmedText.startsWith('❌') || 
                trimmedText.startsWith('╭') || 
                trimmedText.startsWith('┌') || 
                trimmedText.startsWith('🎬') || 
                trimmedText.startsWith('⚠️') || 
                trimmedText.startsWith('🟢') || 
                trimmedText.startsWith('Done') ||
                trimmedText.includes('Failed to download') ||
                trimmedText.includes('Cloudflare protection') ||
                trimmedText.includes('Direct YouTube video URL') ||
                trimmedText.includes('Auto-routing') ||
                trimmedText.includes('Task completed')
            );

            if (!isBotOutputMessage) {
                const urlMatch = trimmedText.match(/https?:\/\/[^\s]+/i);
                if (urlMatch && urlMatch[0]) {
                    let detectedUrl = urlMatch[0].replace(/[)\],.*_*]+$/, '').trim();
                    const lowerUrl = detectedUrl.toLowerCase();

                    console.log(`[DanieWatch] 🔗 Direct URL detected: "${detectedUrl}"`);

                    const safeExec = async (cmdKey) => {
                        if (typeof DANIE_COMMANDS[cmdKey] === 'function') {
                            await DANIE_COMMANDS[cmdKey](conn, mek, targetJid, senderJid, detectedUrl, reply);
                        } else {
                            console.warn(`[DanieWatch] Auto-route target command "${cmdKey}" is not registered in DANIE_COMMANDS.`);
                        }
                    };

                    if (lowerUrl.includes('tiktok.com')) {
                        console.log(`[DanieWatch] Auto-routing TikTok link to .tiktok handler...`);
                        await safeExec('tiktok');
                        return;
                    }
                    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
                        console.log(`[DanieWatch] Auto-routing Instagram link to .ig handler...`);
                        await safeExec('ig');
                        return;
                    }
                    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.gg') || lowerUrl.includes('fb.com')) {
                        console.log(`[DanieWatch] Auto-routing Facebook link to .fb handler...`);
                        await safeExec('fb');
                        return;
                    }
                    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
                        console.log(`[DanieWatch] Auto-routing Twitter/X link to .twitter handler...`);
                        await safeExec('twitter');
                        return;
                    }
                    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
                        if (lowerUrl.includes('music.youtube.com') || trimmedText.toLowerCase().includes('audio') || trimmedText.toLowerCase().includes('song') || trimmedText.toLowerCase().includes('mp3')) {
                            console.log(`[DanieWatch] Auto-routing YouTube Music link to .ytm handler...`);
                            await safeExec('ytm');
                        } else {
                            console.log(`[DanieWatch] Auto-routing YouTube Video link to .yt handler...`);
                            await safeExec('yt');
                        }
                        return;
                    }
                    if (lowerUrl.includes('nexdrive.fit') || lowerUrl.includes('vcloud.fit') || lowerUrl.includes('vcloud.zip')) {
                        console.log(`[DanieWatch] Auto-routing Series link to .se handler...`);
                        await safeExec('se');
                        return;
                    }
                }
            }

            // ══════════════════════════════════════════════════════════════════
            //  UNIVERSAL AI AGENT CONTROLLER — Full Bot Control & Assistant Router
            // ══════════════════════════════════════════════════════════════════
            if (!isBotOutputMessage && trimmedText) {
                console.log(`[UniversalAIAgent] 🤖 Analyzing natural language request in You (own) chat: "${trimmedText}"`);
                try {
                    const { understandUniversalIntent } = require('../Utils/ai_provider');
                    const { handleHomepageExtract } = require('./ai_search');

                    const actionIntent = await understandUniversalIntent(trimmedText);
                    console.log(`[UniversalAIAgent] 🎯 Action Intent Classified:`, actionIntent);

                    const actionType = actionIntent.action || 'search_download';

                    // 1. Action: homepage_extract / category_extract
                    if (actionType === 'homepage_extract' || actionType === 'category_extract') {
                        const site = actionIntent.site || 'vegamovies';
                        const category = actionIntent.category || null;
                        await handleHomepageExtract(conn, mek, site, category);
                        return;
                    }

                    // 2. Action: toggle_antilink
                    if (actionType === 'toggle_antilink') {
                        const targetName = (actionIntent.targetGroupName || '').trim();
                        const enable = actionIntent.enable !== false;

                        const { addGroupToAntilink, removeGroupFromAntilink } = require('../Utils/antilink');

                        let groupsObj = {};
                        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
                        const groupsList = Object.values(groupsObj);

                        let matchedGroup = null;
                        if (targetName) {
                            const lTarget = targetName.toLowerCase();
                            matchedGroup = groupsList.find(g => (g.subject || '').toLowerCase().includes(lTarget) || (g.name || '').toLowerCase().includes(lTarget));
                        }

                        if (!matchedGroup && groupsList.length === 1) {
                            matchedGroup = groupsList[0];
                        }

                        if (matchedGroup) {
                            const confirmKey = `${targetJid}_group_${Date.now().toString().slice(-4)}`;
                            const actionLabel = enable ? 'Turn ON Anti-Link Protection' : 'Turn OFF Anti-Link Protection';
                            const confirmText = `⚠️ *Confirmation Required:* ${actionLabel} for group *${matchedGroup.subject || matchedGroup.name}* (\`${matchedGroup.id}\`)?\n\n` +
                                                `Reply with *yes* to confirm or *no* to cancel.`;

                            const sentMsg = await reply(confirmText);
                            if (sentMsg && sentMsg.key && sentMsg.key.id) {
                                pendingGroupConfirmations.set(confirmKey, {
                                    chatId: targetJid,
                                    sender: senderJid,
                                    mode: 'antilink',
                                    enable,
                                    groupJid: matchedGroup.id,
                                    groupName: matchedGroup.subject || matchedGroup.name,
                                    messageId: sentMsg.key.id,
                                    timestamp: Date.now()
                                });
                            }
                            return;
                        } else {
                            await handleAntilinkCommand(conn, mek, targetJid, senderJid, enable ? 'add' : 'remove', reply);
                            return;
                        }
                    }

                    // 3. Action: toggle_antispam
                    if (actionType === 'toggle_antispam') {
                        const targetName = (actionIntent.targetGroupName || '').trim();
                        const enable = actionIntent.enable !== false;

                        const { addGroupToAntispam, removeGroupFromAntispam } = require('../Utils/antispam');

                        let groupsObj = {};
                        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
                        const groupsList = Object.values(groupsObj);

                        let matchedGroup = null;
                        if (targetName) {
                            const lTarget = targetName.toLowerCase();
                            matchedGroup = groupsList.find(g => (g.subject || '').toLowerCase().includes(lTarget) || (g.name || '').toLowerCase().includes(lTarget));
                        }

                        if (matchedGroup) {
                            const confirmKey = `${targetJid}_group_${Date.now().toString().slice(-4)}`;
                            const actionLabel = enable ? 'Turn ON Anti-Spam Protection' : 'Turn OFF Anti-Spam Protection';
                            const confirmText = `⚠️ *Confirmation Required:* ${actionLabel} for group *${matchedGroup.subject || matchedGroup.name}* (\`${matchedGroup.id}\`)?\n\n` +
                                                `Reply with *yes* to confirm or *no* to cancel.`;

                            const sentMsg = await reply(confirmText);
                            if (sentMsg && sentMsg.key && sentMsg.key.id) {
                                pendingGroupConfirmations.set(confirmKey, {
                                    chatId: targetJid,
                                    sender: senderJid,
                                    mode: 'antispam',
                                    enable,
                                    groupJid: matchedGroup.id,
                                    groupName: matchedGroup.subject || matchedGroup.name,
                                    messageId: sentMsg.key.id,
                                    timestamp: Date.now()
                                });
                            }
                            return;
                        } else {
                            await handleAntispamCommand(conn, mek, targetJid, senderJid, enable ? 'add' : 'remove', reply);
                            return;
                        }
                    }

                    // 4. Action: queue_management
                    if (actionType === 'queue_management') {
                        const sub = (actionIntent.subAction || 'show').toLowerCase();
                        if (sub === 'clear') {
                            if (typeof DANIE_COMMANDS['c'] === 'function') await DANIE_COMMANDS['c'](conn, mek, targetJid, senderJid, '', reply);
                        } else if (sub === 'remove' && actionIntent.itemIndex) {
                            if (typeof DANIE_COMMANDS['qdel'] === 'function') await DANIE_COMMANDS['qdel'](conn, mek, targetJid, senderJid, String(actionIntent.itemIndex), reply);
                        } else {
                            if (typeof DANIE_COMMANDS['que'] === 'function') await DANIE_COMMANDS['que'](conn, mek, targetJid, senderJid, '', reply);
                        }
                        return;
                    }

                    // 5. Action: daily_release_list
                    if (actionType === 'daily_release_list') {
                        const sub = (actionIntent.subAction || 'generate').toLowerCase();
                        if (sub === 'history') {
                            if (typeof DANIE_COMMANDS['7days'] === 'function') await DANIE_COMMANDS['7days'](conn, mek, targetJid, senderJid, '', reply);
                        } else {
                            if (typeof DANIE_COMMANDS['createlist'] === 'function') await DANIE_COMMANDS['createlist'](conn, mek, targetJid, senderJid, '', reply);
                        }
                        return;
                    }

                    // 6. Action: domain_settings
                    if (actionType === 'domain_settings') {
                        if (actionIntent.subAction === 'update' && actionIntent.value) {
                            const choice = actionIntent.site === 'rogmovies' ? '1' : (actionIntent.site === 'vegamovies' ? '2' : '3');
                            const res = setDomain(choice, actionIntent.value);
                            if (res.success) {
                                await reply(`✅ *Domain Updated Successfully!*\n\n• *Site:* ${res.site || 'Settings'}\n• *Value:* \`${actionIntent.value}\``);
                            } else {
                                await reply(`❌ ${res.error}`);
                            }
                        } else {
                            if (typeof DANIE_COMMANDS['domain'] === 'function') await DANIE_COMMANDS['domain'](conn, mek, targetJid, senderJid, '', reply);
                        }
                        return;
                    }

                    // 7. Action: system_status
                    if (actionType === 'system_status') {
                        if (typeof DANIE_COMMANDS['status'] === 'function') await DANIE_COMMANDS['status'](conn, mek, targetJid, senderJid, '', reply);
                        return;
                    }

                    // 8. Action: search_download (Executed strictly when search or movie/season keywords are present)
                    const { isSearchKeywordPresent } = require('../Utils/ai_provider');
                    if (actionType === 'search_download' && isSearchKeywordPresent(trimmedText)) {
                        console.log(`[UniversalAIAgent] Executing search_download for query: "${actionIntent.query || trimmedText}"`);
                        await handleAiSearchCommand(conn, mek, [], trimmedText);
                        return;
                    }

                    // 9. Action: general_ai_assistant (General Q&A, Voice Notes, Conversational Chat without movie search keywords) - DISABLED
                    console.log(`[UniversalAIAgent] 💬 General AI chat features are disabled. Ignoring natural chat prompt: "${trimmedText}"`);
                    return;
                } catch (aiErr) {
                    console.error('[UniversalAIAgent] Error processing natural language command:', aiErr.message);
                }
            }
        }
    } catch (err) {
        console.error('[DanieDownload] Error in messages.upsert handler:', err);
    }
});
}

let _groupFetchCache = { data: null, timestamp: 0 };

async function safeFetchParticipatingGroups(conn, timeoutMs = 15000) {
    const now = Date.now();
    if (_groupFetchCache.data && (now - _groupFetchCache.timestamp < 120000)) {
        return _groupFetchCache.data;
    }
    try {
        if (!conn) return _groupFetchCache.data || {};
        console.log('[DanieWatch] 🔍 Fetching participating groups from WhatsApp...');
        const fetchPromise = conn.groupFetchAllParticipating();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
        const res = await Promise.race([fetchPromise, timeoutPromise]);
        if (res && typeof res === 'object') {
            const count = Object.keys(res).length;
            console.log(`[DanieWatch] ✅ Found ${count} participating group(s).`);
            _groupFetchCache = { data: res, timestamp: now };
            return res;
        } else {
            console.log('[DanieWatch] ⚠️ groupFetchAllParticipating timed out or returned null.');
        }
    } catch (e) {
        console.error('[DanieWatch] ❌ groupFetchAllParticipating error:', e.message);
    }
    return _groupFetchCache.data || {};
}

let _cachedSudo = null;
let _cachedSudoTime = 0;

function loadSudo() {
    const now = Date.now();
    if (_cachedSudo && (now - _cachedSudoTime < 60000)) return _cachedSudo;
    const sudoPath = path.join(__dirname, '..', 'data', 'sudo.json');
    if (!fs.existsSync(sudoPath)) {
        _cachedSudo = [];
        _cachedSudoTime = now;
        return _cachedSudo;
    }
    try {
        _cachedSudo = JSON.parse(fs.readFileSync(sudoPath, 'utf8')) || [];
        _cachedSudoTime = now;
        return _cachedSudo;
    } catch (_) {
        _cachedSudo = [];
        return _cachedSudo;
    }
}

function saveSudo(nums) {
    const sudoDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(sudoDir)) fs.mkdirSync(sudoDir, { recursive: true });
    const sudoPath = path.join(sudoDir, 'sudo.json');
    fs.writeFileSync(sudoPath, JSON.stringify(nums, null, 2), 'utf8');
    _cachedSudo = nums;
    _cachedSudoTime = Date.now();
}

let _cachedCredsMe = null;
let _cachedCredsTime = 0;

function getCredsMe() {
    const now = Date.now();
    if (_cachedCredsMe && (now - _cachedCredsTime < 60000)) return _cachedCredsMe;
    try {
        const credsPath = path.join(__dirname, '..', '..', 'session', 'creds.json');
        if (fs.existsSync(credsPath)) {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds && creds.me) {
                _cachedCredsMe = creds.me;
                _cachedCredsTime = now;
                return _cachedCredsMe;
            }
        }
    } catch (_) {}
    return _cachedCredsMe;
}

function isOwner(senderJid, mek = null) {
    if (mek && mek.key && mek.key.fromMe) return true;
    if (!senderJid) return false;

    const rawSender = String(senderJid || '');
    const rawParticipant = mek && mek.key ? String(mek.key.participant || '') : '';
    const rawRemote = mek && mek.key ? String(mek.key.remoteJid || '') : '';

    const extractUserPart = (jid) => {
        if (!jid || typeof jid !== 'string') return '';
        return jid.split('@')[0].split(':')[0].trim();
    };

    const targets = [rawSender, rawParticipant, rawRemote].filter(Boolean);

    // 1. Check against active Baileys socket user object (conn.user)
    if (_connInstance && _connInstance.user) {
        const botIdNum = extractUserPart(_connInstance.user.id);
        const botLidNum = extractUserPart(_connInstance.user.lid);

        for (const target of targets) {
            const targetNum = extractUserPart(target);
            if (!targetNum) continue;
            if (botIdNum && targetNum === botIdNum) return true;
            if (botLidNum && targetNum === botLidNum) return true;
        }
    }

    // 2. Read creds me directly (cached) in case conn.user isn't fully populated yet
    const credsMe = getCredsMe();
    if (credsMe) {
        const credsIdNum = extractUserPart(credsMe.id);
        const credsLidNum = extractUserPart(credsMe.lid);

        for (const target of targets) {
            const targetNum = extractUserPart(target);
            if (!targetNum) continue;
            if (credsIdNum && targetNum === credsIdNum) return true;
            if (credsLidNum && targetNum === credsLidNum) return true;
        }
    }

    // 3. Check against configured owner phone numbers & SUDO
    const cJid = cleanJid(senderJid);
    const senderNum = extractUserPart(cJid);
    const ownerNum = (process.env.NUMBER || process.env.BOT_NUMBER || '923013068663').trim().replace(/[^0-9]/g, '');
    const envSudoNums = (process.env.SUDO || '923013068663').split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean);
    const dynamicSudo = loadSudo();
    const defaultOwners = ['923013068663', '923000000000', '94762898540', '94717775628', '94758775628'];
    const allOwners = [...defaultOwners, ownerNum, ...envSudoNums, ...dynamicSudo].filter(Boolean);

    for (const target of [...targets, senderNum]) {
        if (!target) continue;
        const numPart = extractUserPart(target);
        if (!numPart) continue;
        if (allOwners.some(owner => owner && (numPart === owner || numPart.endsWith(owner) || owner.endsWith(numPart)))) {
            return true;
        }
    }

    return false;
}

// Parse download command item — extracts URL only (no custom filename renaming)
function parseDownloadItem(item) {
    let customFilename = null;
    let url = item.trim();

    const firstEqIdx = item.indexOf('=');
    if (firstEqIdx !== -1) {
        const leftPart = item.substring(0, firstEqIdx).trim();
        const rightPart = item.substring(firstEqIdx + 1).trim();
        
        // If the left part is a TMDB URL, preserve it as customFilename for .p command metadata
        if (/themoviedb\.org/i.test(leftPart)) {
            customFilename = leftPart;
            url = rightPart;
        } else if (!leftPart.startsWith('http://') && !leftPart.startsWith('https://')) {
            // Non-URL left part is the custom filename, right part is the URL
            customFilename = leftPart;
            url = rightPart;
        }
        // If the left part starts with http(s), the '=' is part of the URL's query string
        // (e.g. pre-signed R2/S3 URLs with X-Amz-Algorithm=, X-Amz-Signature=, etc.)
        // Do NOT split — preserve the full original URL intact.
    }
    return { customFilename, url };
}


// =========================================================================
//  .config   Interactive owner-only configuration wizard
// =========================================================================
cmd({
    pattern: 'config',
    react: '⚙️',
    desc: 'Configure receiver destinations (groups & private numbers).',
    category: 'download',
    use: '.config',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    try {
        const senderJid = m.sender || mek.sender || from;
        if (!isOwner(senderJid)) {
            return reply('❌ Only the bot owner can use this command.');
        }

        initUpsertListener(conn);
        const cleanSender = cleanJid(senderJid);

        let groupsObj = {};
        try {
            groupsObj = await conn.groupFetchAllParticipating();
        } catch (_) {}

        const groups = Object.values(groupsObj).map(g => ({
            jid: g.id,
            subject: g.subject || 'Unknown Group'
        }));

        pendingConfig[cleanSender] = { step: 'combined_config', groups, messageId: null };

        if (q && q.trim()) {
            return handleConfigReply(conn, mek, m, senderJid, q.trim(), reply);
        }

        const current = loadSettings();
        let targetText = '';
        if (current.targets && current.targets.length > 0) {
            current.targets.forEach((t, idx) => {
                const icon = t.type === 'group' ? '👥' : '👤';
                targetText += `│   ${idx + 1}. ${icon} *${t.name}* (${t.jid})\n`;
            });
        } else if (current.mode === 'group' && current.groupJid) {
            targetText += `│   1. 👥 *${current.groupName || 'Group'}* (${current.groupJid})\n`;
        } else {
            targetText = `│   _Private Chat (+${cleanSender.split('@')[0]})_\n`;
        }

        let groupListText = '';
        if (groups.length > 0) {
            groups.forEach((g, i) => {
                groupListText += `│   \`${i + 1}\` • 👥 ${g.subject}\n`;
            });
        } else {
            groupListText = '│   _No active groups found._\n';
        }

        const sent = await reply(
            `╭─── ⚙️ *RECEIVER CONFIG* ⚙️ ───╮\n\n` +
            `┌─❒ *Current Active Receiver(s)*\n` +
            `${targetText}` +
            `└───────────────\n\n` +
            `┌─❒ *Available Groups (${groups.length})*\n` +
            `${groupListText}` +
            `└───────────────\n\n` +
            `💡 *How to Set Receivers:*\n` +
            `  • Reply with group number(s) (e.g. \`1\`, \`1, 2\`, \`1-3\`, or \`all\`)\n` +
            `  • Reply with phone number(s) in international format (e.g. \`923013068663\`)\n` +
            `  • Combine both! (e.g. \`1, +923013068663\`)\n` +
            `  • Reply \`clear\` to reset back to Private Chat.\n\n` +
            `_Reply to this message with your choice(s)._`
        );
        if (sent && sent.key) {
            pendingConfig[cleanSender].messageId = sent.key.id;
        }
    } catch (error) {
        console.error('[DanieDownload] Config error:', error);
        reply(`❌ Config error: ${error.message}`);
    }
});

async function handleConfigReply(conn, mek, m, senderJid, text, reply) {
    const cleanSender = cleanJid(senderJid);
    let state = pendingConfig[cleanSender];
    
    if (!state || !state.groups || state.groups.length === 0) {
        let groupsObj = {};
        try {
            groupsObj = await conn.groupFetchAllParticipating();
        } catch (_) {}
        const groups = Object.values(groupsObj).map(g => ({
            jid: g.id,
            subject: g.subject || 'Unknown Group'
        }));
        if (!state) {
            state = { step: 'combined_config', groups, messageId: null };
            pendingConfig[cleanSender] = state;
        } else {
            state.groups = groups;
        }
    }

    const groups = state.groups || [];
    const rawText = text.trim();
    const lowerText = rawText.toLowerCase();

    if (['clear', 'reset', 'clean'].includes(lowerText)) {
        saveSettings({ mode: 'private', targets: [], groupJid: '', groupName: '', privateJid: '', privateName: '' });
        delete pendingConfig[cleanSender];
        return reply(`╭─── 🔄 *CONFIG RESET* 🔄 ───╮\n\n✅ All target receivers cleared!\n\nDefault receiver reset to Private Chat: *+${cleanSender.split('@')[0]}*`);
    }

    let selectedTargets = [];

    if (lowerText === 'all') {
        selectedTargets = groups.map(g => ({ jid: cleanJid(g.jid), name: g.subject, type: 'group' }));
    } else {
        const parts = rawText.split(/[,;\n]+/);
        for (const p of parts) {
            const trimmed = p.trim();
            if (!trimmed) continue;

            if (trimmed.includes('-') && !trimmed.startsWith('+')) {
                const rangeParts = trimmed.split('-').map(s => s.trim());
                const startNum = parseInt(rangeParts[0], 10);
                const endNum = parseInt(rangeParts[1], 10);
                if (!isNaN(startNum) && !isNaN(endNum) && startNum >= 1 && endNum <= groups.length && startNum <= endNum) {
                    for (let i = startNum; i <= endNum; i++) {
                        const g = groups[i - 1];
                        if (g) selectedTargets.push({ jid: cleanJid(g.jid), name: g.subject, type: 'group' });
                    }
                    continue;
                }
            }

            const cleanNum = trimmed.replace(/[^0-9]/g, '');
            if (!cleanNum) continue;

            const intVal = parseInt(cleanNum, 10);
            if (cleanNum.length <= 3 && !isNaN(intVal) && intVal >= 1 && intVal <= groups.length) {
                const g = groups[intVal - 1];
                if (g) selectedTargets.push({ jid: cleanJid(g.jid), name: g.subject, type: 'group' });
            } else if (cleanNum.length >= 7) {
                let jid = cleanJid(`${cleanNum}@s.whatsapp.net`);
                try {
                    if (conn && typeof conn.onWhatsApp === 'function') {
                        const [onWa] = await conn.onWhatsApp(cleanNum);
                        if (onWa && onWa.exists && onWa.jid) {
                            jid = cleanJid(onWa.jid);
                        }
                    }
                } catch (_) {}
                selectedTargets.push({ jid, name: `+${cleanNum}`, type: 'private' });
            }
        }
    }

    if (selectedTargets.length === 0) {
        if (groups.length === 0) {
            return reply('❌ No active groups found for the bot. Make sure the bot is added to a WhatsApp group.');
        }
        return reply(`❌ Invalid choice! Reply with group serial number(s) (e.g. \`1\` or \`1, 2\`), phone number(s) (e.g. \`923013068663\`), or \`all\`. Or reply \`clear\` to reset.`);
    }

    const settings = loadSettings();
    settings.targets = selectedTargets;

    const firstGroup = selectedTargets.find(t => t.type === 'group');
    const firstPrivate = selectedTargets.find(t => t.type === 'private');

    if (firstGroup) {
        settings.mode = 'group';
        settings.groupJid = cleanJid(firstGroup.jid);
        settings.groupName = firstGroup.name;
    } else {
        settings.groupJid = '';
        settings.groupName = '';
    }

    if (firstPrivate) {
        if (!firstGroup) settings.mode = 'private';
        settings.privateJid = cleanJid(firstPrivate.jid);
        settings.privateName = firstPrivate.name;
    } else {
        settings.privateJid = '';
        settings.privateName = '';
    }

    saveSettings(settings);
    delete pendingConfig[cleanSender];

    let resText = `╭─── ⚙️ *CONFIG SAVED* ⚙️ ───╮\n\n✅ Saved *${selectedTargets.length}* target receiver(s) for Upload & Auto-Forwarding:\n\n`;
    settings.targets.forEach((t, idx) => {
        const icon = t.type === 'group' ? '👥' : '👤';
        resText += `  ${idx + 1}. ${icon} *${t.name}*\n`;
    });
    return reply(resText.trim());
}

// =========================================================================
//  .setgroup   Quick shortcut to pick a group destination
// =========================================================================
cmd({
    pattern: 'setgroup',
    react: '=',
    desc: 'Quick-set the target group for downloads.',
    category: 'download',
    use: '.setgroup list  OR  .setgroup <number>',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    try {
        const senderJid = m.sender || mek.sender || from;
        if (!isOwner(senderJid)) {
            return reply('❌ Only the bot owner can use this command.');
        }

        const arg = (q || '').trim().toLowerCase();

        let groupsObj;
        try {
            groupsObj = await conn.groupFetchAllParticipating();
        } catch (err) {
            return reply(`❌ Failed to fetch groups: ${err.message}`);
        }

        const groups = Object.values(groupsObj).map(g => ({
            jid: g.id,
            subject: g.subject || 'Unknown Group'
        }));

        if (groups.length === 0) {
            return reply('❌ No groups found.');
        }

        const cleanSender = cleanJid(senderJid);

        if (!arg || arg === 'list') {
            pendingConfig[cleanSender] = { step: 'group', groups };

            let list = '= *Your Groups:*\n\n';
            groups.forEach((g, i) => {
                list += `  \`${i + 1}\`  ${g.subject}\n`;
            });
            list += `\n_Reply with just the number to select._`;
            return reply(list);
        }

        const num = parseInt(arg, 10);
        if (isNaN(num) || num < 1 || num > groups.length) {
            return reply(`❌ Invalid selection. Use a number from 1 to ${groups.length}.\nUse \`.setgroup list\` to see all groups.`);
        }

        const chosen = groups[num - 1];
        const settings = {
            mode: 'group',
            groupJid: cleanJid(chosen.jid),
            groupName: chosen.subject,
            privateJid: '',
            privateName: '',
            targets: [{ jid: cleanJid(chosen.jid), name: chosen.subject, type: 'group' }]
        };
        saveSettings(settings);
        delete pendingConfig[cleanSender];
        return reply(` Download target set to group: *${chosen.subject}*\n🎬 \`${chosen.jid}\``);

    } catch (error) {
        console.error('[DanieDownload] Setgroup error:', error);
        reply(`❌ Error: ${error.message}`);
    }
});

function parseQueryToItems(q) {
    if (!q) return [];
    
    // Find all HTTP/HTTPS URLs with their indices
    const urlRegex = /https?:\/\/[^\s,]+/gi;
    const matches = [];
    let match;
    while ((match = urlRegex.exec(q)) !== null) {
        matches.push({
            url: match[0],
            index: match.index,
            length: match[0].length
        });
    }

    if (matches.length === 0) {
        // No URLs found, fallback to original comma split
        return q.split(',').map(item => item.trim()).filter(Boolean);
    }

    const splitPoints = [0];
    for (let i = 0; i < matches.length - 1; i++) {
        const endOfCurrentUrl = matches[i].index + matches[i].length;
        const startOfNextUrl = matches[i+1].index;
        const midText = q.substring(endOfCurrentUrl, startOfNextUrl);
        
        const lastCommaIdx = midText.lastIndexOf(',');
        if (lastCommaIdx !== -1) {
            splitPoints.push(endOfCurrentUrl + lastCommaIdx);
        } else {
            const lastSpaceIdx = midText.lastIndexOf(' ');
            if (lastSpaceIdx !== -1) {
                splitPoints.push(endOfCurrentUrl + lastSpaceIdx);
            } else {
                splitPoints.push(endOfCurrentUrl);
            }
        }
    }
    splitPoints.push(q.length);

    const items = [];
    for (let i = 0; i < splitPoints.length - 1; i++) {
        let itemText = q.substring(splitPoints[i], splitPoints[i+1]).trim();
        itemText = itemText.replace(/^[\s,]+|[\s,]+$/g, '').trim();
        if (itemText) {
            items.push(itemText);
        }
    }
    
    return items;
}

// =========================================================================
//  .download  Enhanced: supports multiple files, movie scraping, TMDB info
// =========================================================================
function extractTitleFromFilename(fileName) {
    if (!fileName) return '';
    let name = fileName.replace(/\.[a-z0-9]{2,4}$/i, '');
    name = name.replace(/[\.\_]/g, ' ');
    name = name.replace(/\bs\d+\s*e\d+\b.*/i, '');
    name = name.replace(/\bs\d+\b.*/i, '');
    name = name.replace(/\bepisode\s*\d+\b.*/i, '');
    name = name.replace(/\b(480p|720p|1080p|2160p|4k|web-dl|webrip|bluray|hdrip|x264|x265|hevc|esub|hindi|english|dual|multi|audio|daniewatch|vegamovies)\b.*/i, '');
    return name.trim();
}

async function downloadCommandHandler(conn, mek, from, senderJid, q, reply, abortSignal = null, activeDownloadRef = null, preferredServer = null, silentErrors = false) {
    console.log("=== DOWNLOAD COMMAND TRIGGERED ===");
    console.log("q:", q);
    try {
        if (!q) {
            return reply(
                'R Please provide a download link!\n\n' +
                '*Usage:*\n' +
                '`.d https://example.com/file.zip`\n' +
                '`.d myname.zip = https://example.com/file.zip`\n' +
                '`.d file1 = link1, file2 link2`\n' +
                '`.d https://vegamovies.dad/some-movie/`'
            );
        }

        const items = parseQueryToItems(q);

        const settings = loadSettings();
        const { activeTargets, primaryJid, destLabel } = getActiveTargetsAndPrimary(settings, senderJid);
        const destJid = primaryJid;

        let totalBytesAllItems = 0;
        const downloadedEpisodesList = [];
        let detectedMediaTitle = '';
        let isSeriesDownload = false;

        for (let i = 0; i < items.length; i++) {
            if (abortSignal && abortSignal.aborted) {
                console.log('[DanieDownload] Abort signal detected. Stopping download items loop.');
                throw new Error('Aborted');
            }
            let { customFilename, url } = parseDownloadItem(items[i]);
            let targetFilename = customFilename;

            // Direct download bypass (no movie scraping/resolution)

            // Basic URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                await reply(`❌ Invalid link format for item ${i + 1}! Skipping.\nParsed URL: \`${url}\``);
                continue;
            }

            // Normalize Pixeldrain URLs via Cloudflare Worker proxy endpoint (bypassing 6GB daily limit)
            if (url.includes('pixeldrain') || url.includes('sriflix.online')) {
                url = applyPixeldrainWorkerProxy(url);
                console.log('[DanieDownload] Routed Pixeldrain URL via Cloudflare Worker proxy:', url);
            }

            // Determine temporary/target filename
            let tempFilename = targetFilename || ('file_' + Date.now());
            if (!targetFilename) {
                try {
                    const parsedUrlObj = new URL(url);
                    
                    // 1. Check response-content-disposition or filename query parameter (presigned S3 / R2 URLs)
                    const rcdParam = parsedUrlObj.searchParams.get('response-content-disposition') || parsedUrlObj.searchParams.get('filename');
                    if (rcdParam) {
                        const cdMatch = rcdParam.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n"']+)/i)
                                     || rcdParam.match(/filename="([^"]+)"/i)
                                     || rcdParam.match(/filename=([^;\n"'\s]+)/i)
                                     || [null, rcdParam];
                        if (cdMatch && cdMatch[1]) {
                            const paramName = decodeURIComponent(cdMatch[1].trim());
                            if (paramName && paramName.includes('.') && paramName.length > 3) {
                                tempFilename = paramName;
                                console.log('[DanieDownload] ✅ Filename extracted from URL query parameter:', tempFilename);
                            }
                        }
                    }

                    // 2. Check URL pathname for valid file extension
                    if (tempFilename.startsWith('file_')) {
                        const urlPath = parsedUrlObj.pathname;
                        const urlFile = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                        if (urlFile && urlFile.includes('.') && urlFile.length > 3) {
                            tempFilename = decodeURIComponent(urlFile);
                            console.log('[DanieDownload] ✅ Filename extracted from URL pathname:', tempFilename);
                        }
                    }
                } catch (err) {}
            }

            // ── HEAD request for filename pre-detection (only if filename is still unknown / file_) ──
            // S3/R2 presigned URLs reject HEAD requests with 403 because AWS signatures are method-bound.
            // If filename was already extracted from query/path, skip HEAD request entirely!
            if (!targetFilename && tempFilename.startsWith('file_')) {
                try {
                    const parsedHeadUrl = new URL(url);
                    const headResponse = await axios.head(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Referer': parsedHeadUrl.origin + '/'
                        },
                        httpsAgent: browserHttpsAgent,
                        timeout: 15000,
                        maxRedirects: 10,
                        validateStatus: (s) => s >= 200 && s < 400
                    });
                    const headCD = (headResponse.headers && headResponse.headers['content-disposition']) || '';
                    if (headCD) {
                        // Try filename*= (RFC 5987) first, then filename="...", then filename=...
                        const cdMatch = headCD.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n"']+)/i)
                                     || headCD.match(/filename="([^"]+)"/i)
                                     || headCD.match(/filename=([^;\n"'\s]+)/i);
                        if (cdMatch && cdMatch[1]) {
                            const headFilename = decodeURIComponent(cdMatch[1].trim());
                            if (headFilename && headFilename.length > 1) {
                                tempFilename = headFilename;
                                console.log('[DanieDownload] ✅ Filename from HEAD Content-Disposition:', headFilename);
                            }
                        }
                    }
                    // Also check the final redirected URL for a filename
                    const finalUrl = headResponse.request?.res?.responseUrl || headResponse.config?.url || '';
                    if (finalUrl && tempFilename.startsWith('file_')) {
                        try {
                            const finalPath = new URL(finalUrl).pathname;
                            const finalFile = finalPath.substring(finalPath.lastIndexOf('/') + 1);
                            if (finalFile && finalFile.includes('.') && finalFile.length > 3) {
                                tempFilename = decodeURIComponent(finalFile);
                                console.log('[DanieDownload] ✅ Filename from final redirect URL:', tempFilename);
                            }
                        } catch (_) {}
                    }
                } catch (headErr) {
                    console.log('[DanieDownload] HEAD request for filename pre-detection failed (non-fatal):', headErr.message);
                }
            }

            const safeTempFilename = (tempFilename || 'download_file')
                .replace(/[:*?"<>|\\/]/g, '_')
                .replace(/[\{\}\[\]]/g, '')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .slice(0, 80);
            let tempFilePath = path.join(__dirname, 'tmp_' + Date.now() + '_' + safeTempFilename);

            // If the URL points to a redirector/landing page, resolve it first
            if (isLandingUrl(url)) {
                try {
                    const resolved = await resolveVcloudLink(url, preferredServer);
                    if (resolved && resolved !== url && !isLandingUrl(resolved)) {
                        url = resolved;
                        console.log('[DanieDownload] Resolved redirect URL:', url);
                    } else {
                        // Sub-options fallback if direct resolution returned same landing link
                        const subOpts = await extractSubOptions(url);
                        if (subOpts && subOpts.length > 0 && subOpts[0].href && !isLandingUrl(subOpts[0].href)) {
                            url = subOpts[0].href;
                            console.log('[DanieDownload] Resolved via sub-options fallback:', url);
                        }
                    }
                } catch (e) {
                    console.error('[DanieDownload] Failed to resolve redirect link:', e.message);
                }
            }

            if (isLandingUrl(url)) {
                throw new Error(`The hoster site (${url}) Cloudflare protection blocked link resolution. Please try choosing another server link or mirror.`);
            }

            if (activeDownloadRef) {
                activeDownloadRef.filePath = tempFilePath;
            }

            // Notify user if single movie download starting
            const isMovieSingle = items.length === 1 && !/S\d+\s*E\d+|\bE\d+\b|\bEpisode\s*\d+/i.test(url) && !/S\d+\s*E\d+|\bE\d+\b|\bEpisode\s*\d+/i.test(q || '');
            if (isMovieSingle && i === 0) {
                try {
                    await reply('⏳ *Downloading, please wait . . .*');
                } catch (_) {}
            }

            // Download using resume-enabled download function
            const responseHeaders = await downloadFileWithResume(url, tempFilePath, {}, abortSignal);

            if (abortSignal && abortSignal.aborted) {
                throw new Error('Aborted');
            }

            // Extract real filename from Content-Disposition header (download response)
            // This is the DEFINITIVE filename — the same name mobile/PC downloaders show.
            const contentDisposition = (responseHeaders && responseHeaders['content-disposition']) || '';
            if (contentDisposition) {
                try {
                    // Try filename*= (RFC 5987) first, then filename="...", then filename=...
                    const cdMatch = contentDisposition.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n"']+)/i)
                                 || contentDisposition.match(/filename="([^"]+)"/i)
                                 || contentDisposition.match(/filename=([^;\n"'\s]+)/i);
                    if (cdMatch && cdMatch[1]) {
                        const cdFilename = decodeURIComponent(cdMatch[1].trim());
                        if (cdFilename && cdFilename.length > 1) {
                            if (!targetFilename) {
                                tempFilename = cdFilename;
                                console.log('[DanieDownload] ✅ Filename from download Content-Disposition:', cdFilename);
                            }
                        }
                    }
                } catch (err) {
                    console.error('[DanieDownload] Content-Disposition parse error:', err.message);
                }
            }

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('Downloaded file does not exist on disk.');
            }

            const stats = fs.statSync(tempFilePath);
            const sizeInBytes = stats.size;
            const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

            // Determine extension: prefer tempFilename (from Content-Disposition) over URL path
            let ext = '';
            // 1st priority: extension from Content-Disposition / detected filename
            if (tempFilename && tempFilename.includes('.')) {
                ext = tempFilename.split('.').pop();
            }
            // 2nd priority: extension from URL path
            if (!ext) {
                try {
                    const urlPath = new URL(url).pathname;
                    const urlFile = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                    if (urlFile && urlFile.includes('.')) {
                        ext = urlFile.split('.').pop();
                    }
                } catch (err) {}
            }
            // 3rd priority: fallback — will likely be overridden by magic bytes detection below
            if (!ext) ext = 'bin'; // safe fallback, magic bytes will correct this

            // Detect mime type using file magic bytes (read only first 4100 bytes, not the whole file)
            let mime = (responseHeaders && responseHeaders['content-type']) || 'application/octet-stream';
            try {
                const fd = fs.openSync(tempFilePath, 'r');
                const magicBuffer = Buffer.alloc(4100);
                fs.readSync(fd, magicBuffer, 0, 4100, 0);
                fs.closeSync(fd);
                const detectedType = await fileType.fromBuffer(magicBuffer);
                if (detectedType) {
                    mime = detectedType.mime;
                    ext = detectedType.ext;
                }
            } catch (err) {
                console.error('[DanieDownload] file-type detection error:', err.message);
            }

            const extLower = ext.toLowerCase();
            const filenameLower = (tempFilename || '').toLowerCase();
            const isArchive = ['zip', 'tar', 'gz', 'tgz', 'rar', 'rar5', '7z', '001', 'z01'].includes(extLower) ||
                              filenameLower.endsWith('.zip') || filenameLower.endsWith('.rar') || filenameLower.endsWith('.7z') || filenameLower.endsWith('.001') ||
                              ['application/zip', 'application/x-tar', 'application/x-rar-compressed', 'application/x-gzip', 'application/x-zip-compressed'].includes(mime.toLowerCase());

            // Ensure physical file on disk has the proper extension so external extraction tools recognize it
            let currentExt = path.extname(tempFilePath).toLowerCase();
            if (!currentExt && (ext || tempFilename)) {
                const targetExt = ext ? (ext.startsWith('.') ? ext : '.' + ext) : path.extname(tempFilename);
                if (targetExt && targetExt !== '.') {
                    const renamedPath = tempFilePath + targetExt;
                    try {
                        if (fs.existsSync(tempFilePath)) {
                            fs.renameSync(tempFilePath, renamedPath);
                            tempFilePath = renamedPath;
                            if (activeDownloadRef) activeDownloadRef.filePath = tempFilePath;
                            console.log(`[DanieDownload] Renamed physical temp file to add detected extension: "${path.basename(tempFilePath)}"`);
                        }
                    } catch (renameErr) {
                        console.warn('[DanieDownload] Temp file rename warning:', renameErr.message);
                    }
                }
            }

            // 2GB size limit applies ONLY to non-archive files.
            // Archives can be any size — individual files inside are checked after extraction.
            if (!isArchive && sizeInBytes > 2000 * 1024 * 1024) {
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                await reply(`❌ File ${tempFilename} is too large (${sizeInMB} MB). Max upload limit is 2 GB.`);
                continue;
            }

            if (isArchive) {
                await sendTmdbPosterAndTrailer(conn, activeTargets, tempFilename || targetFilename, 'tv');
                await reply(`📥 Archive detected: *${tempFilename}* (${sizeInMB} MB). Extracting files...`);
                const targetDir = path.join(__dirname, 'extracted_' + Date.now());
                try {
                    await extractArchive(tempFilePath, targetDir, tempFilename || ext, abortSignal);

                    if (abortSignal && abortSignal.aborted) {
                        throw new Error('Aborted');
                    }

                    // Delete the original archive immediately after extraction to free space
                    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                    console.log(`[DanieDownload] Deleted original archive after extraction to free space.`);
                    
                    // Traverse and find files
                    const filesToUpload = getAllFiles(targetDir);
                    console.log(`[DanieDownload] Extracted ${filesToUpload.length} file(s):`, filesToUpload.map(f => path.basename(f)));

                    // Detect shared root folder inside archive
                    let archiveRootFolder = null;
                    if (filesToUpload.length > 0) {
                        const normalizedFiles = filesToUpload.map(f => path.relative(targetDir, f).replace(/\\/g, '/'));
                        const firstRelative = normalizedFiles[0];
                        const firstRoot = firstRelative.split('/')[0];
                        const allShareRoot = normalizedFiles.every(f => {
                            return f.split('/')[0] === firstRoot && f.split('/').length > 1;
                        });
                        if (allShareRoot) {
                            archiveRootFolder = firstRoot;
                        }
                    }

                    // Filter out junk files first to get accurate total count
                    const validFiles = filesToUpload.filter(fp => {
                        const bn = path.basename(fp);
                        return !bn.startsWith('.') && !bn.startsWith('._') && !fp.includes('__MACOSX') && !bn.toLowerCase().includes('.ds_store');
                    });
                    const totalFiles = validFiles.length;
                    
                    let uploadedCount = 0;
                    let skippedCount = 0;
                    let failedCount = 0;
                    const failedFiles = [];
                    const uploadedFiles = [];

                    for (let fi = 0; fi < validFiles.length; fi++) {
                        if (abortSignal && abortSignal.aborted) {
                            console.log('[DanieDownload] Abort signal detected in archive upload loop. Stopping.');
                            throw new Error('Aborted');
                        }

                        const extractedFilePath = validFiles[fi];
                        const baseName = path.basename(extractedFilePath);
                        
                        const fStats = fs.statSync(extractedFilePath);
                        const fileSizeInBytes = fStats.size;
                        const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
                        
                        if (fileSizeInBytes > 2000 * 1024 * 1024) {
                            await reply(` Skipping *${baseName}*  exceeds 2 GB limit (${fileSizeInMB} MB).`);
                            skippedCount++;
                            // Delete oversized file immediately
                            try { if (fs.existsSync(extractedFilePath)) fs.unlinkSync(extractedFilePath); } catch (_) {}
                            continue;
                        }
                        
                        // Detect mime type of extracted file
                        let fileMime = 'application/octet-stream';
                        let fileExt = path.extname(extractedFilePath).substring(1);
                        try {
                            const fd = fs.openSync(extractedFilePath, 'r');
                            const magicBuf = Buffer.alloc(4100);
                            fs.readSync(fd, magicBuf, 0, 4100, 0);
                            fs.closeSync(fd);
                            const detectedType = await fileType.fromBuffer(magicBuf);
                            if (detectedType) {
                                fileMime = detectedType.mime;
                                fileExt = detectedType.ext;
                            }
                        } catch (err) {}
                        
                        // Keep actual file name as it is, just replace branding with DanieWatch
                        const rawBaseName = path.basename(extractedFilePath);
                        const cleanBase = cleanFileName(rawBaseName);
                        let finalFileName = applyBranding(cleanBase);

                        if (!/DanieWatch/i.test(finalFileName)) {
                            finalFileName += ' - DanieWatch';
                        }

                        if (fileExt && !finalFileName.toLowerCase().endsWith('.' + fileExt.toLowerCase())) {
                            finalFileName += '.' + fileExt;
                        }
                        
                        await reply(`📥 Uploading *${fi + 1}/${totalFiles}*: *${path.basename(finalFileName)}* (${fileSizeInMB} MB)`);
                        
                        try {
                            await sendAndForwardFile(conn, activeTargets, {
                                document: { url: extractedFilePath },
                                mimetype: fileMime,
                                fileName: finalFileName
                            }, { quoted: destJid === from ? mek : null, from, senderJid, abortSignal });
                            
                            uploadedCount++;
                            uploadedFiles.push(path.basename(finalFileName));
                            console.log(`[DanieDownload]  Uploaded & deleted: ${finalFileName} (${fileSizeInMB} MB)`);
                        } catch (uploadErr) {
                            if (uploadErr.message === 'Aborted' || (abortSignal && abortSignal.aborted)) {
                                console.log('[DanieDownload] Archive upload aborted by user.');
                                throw new Error('Aborted');
                            }
                            failedCount++;
                            failedFiles.push({ name: path.basename(finalFileName), error: uploadErr.message });
                            console.error(`[DanieDownload] R Upload failed for ${finalFileName}: ${uploadErr.message}`);
                            await reply(`❌ Failed to upload *${path.basename(finalFileName)}*: ${uploadErr.message}`);
                        }

                        // Delete file immediately after upload attempt (success or fail) to free disk space
                        try { if (fs.existsSync(extractedFilePath)) fs.unlinkSync(extractedFilePath); } catch (_) {}
                    }
                    
                    let summaryMsg = ` *Archive Complete!*\n📥 Total files: *${totalFiles}*\n📥 Uploaded: *${uploadedCount}*`;
                    if (skippedCount > 0) summaryMsg += `\n Skipped (too large): *${skippedCount}*`;
                    if (failedCount > 0) {
                        summaryMsg += `\n❌ Failed: *${failedCount}*`;
                        failedFiles.forEach(f => {
                            summaryMsg += `\n   " ${f.name}: ${f.error}`;
                        });
                    }
                    summaryMsg += `\n🎬 *Sent to:* ${destLabel}`;
                    await reply(summaryMsg);
                } catch (err) {
                    if (err.message === 'Aborted' || (abortSignal && abortSignal.aborted)) {
                        console.log('[DanieDownload] Archive process aborted cleanly.');
                        throw err;
                    }
                    await reply(`❌ Failed to extract or process archive: ${err.message}`);
                } finally {
                    // Clean up extracted directory (should be mostly empty now)
                    try {
                        if (fs.existsSync(targetDir)) {
                            if (fs.rmSync) fs.rmSync(targetDir, { recursive: true, force: true });
                            else fs.rmdirSync(targetDir, { recursive: true });
                        }
                    } catch (_) {}
                    // Clean up archive file if it wasn't already deleted
                    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                }
            } else {
                // Non-archive file upload
                // ── Upload AS-IS: NO remux/re-encode ──
                // Direct downloads (.d) are uploaded exactly as downloaded.
                // This preserves ALL audio tracks (multi-language), subtitles,
                // and avoids the remux failure that caused "0 bytes" errors.
                let displayName = '';
                if (targetFilename) {
                    displayName = cleanFileName(targetFilename);
                } else {
                    displayName = cleanFileName(tempFilename);
                }

                let finalFileName = applyBranding(displayName);
                if (ext && !finalFileName.toLowerCase().endsWith('.' + ext.toLowerCase())) {
                    finalFileName += '.' + ext;
                }

                // Validate file exists and is not empty
                if (!fs.existsSync(tempFilePath)) {
                    throw new Error('Downloaded file disappeared from disk before upload.');
                }
                const preUploadStats = fs.statSync(tempFilePath);
                if (preUploadStats.size === 0) {
                    try { fs.unlinkSync(tempFilePath); } catch (_) {}
                    throw new Error('Downloaded file is empty (0 bytes). The download link may be expired or invalid.');
                }
                if (preUploadStats.size < 5000) {
                    // Very small — might be an error page, check content
                    try {
                        const sampleBuf = Buffer.alloc(Math.min(preUploadStats.size, 2048));
                        const fd = fs.openSync(tempFilePath, 'r');
                        fs.readSync(fd, sampleBuf, 0, sampleBuf.length, 0);
                        fs.closeSync(fd);
                        const sampleStr = sampleBuf.toString('utf8').toLowerCase();
                        if (sampleStr.includes('<html') || sampleStr.includes('<!doctype') || sampleStr.includes('access denied') || sampleStr.includes('cloudflare') || sampleStr.includes('403 forbidden') || sampleStr.includes('404 not found')) {
                            try { fs.unlinkSync(tempFilePath); } catch (_) {}
                            throw new Error('Download returned an HTML error page instead of a media file. The link may be expired or blocked.');
                        }
                    } catch (sampleErr) {
                        if (sampleErr.message.includes('HTML error page') || sampleErr.message.includes('0 bytes')) throw sampleErr;
                    }
                }

                await sendAndForwardFile(conn, activeTargets, {
                    document: { url: tempFilePath },
                    mimetype: mime,
                    fileName: finalFileName
                }, { quoted: destJid === from ? mek : null, from, senderJid });

                // Accumulate totals & episode info
                totalBytesAllItems += preUploadStats.size;

                const epMatch = finalFileName.match(/S\d+\s*E(\d+)/i) || 
                                finalFileName.match(/Episode\s*(\d+)/i) || 
                                finalFileName.match(/\bE(\d+)\b/i);

                if (epMatch) {
                    isSeriesDownload = true;
                    const epNum = parseInt(epMatch[1], 10);
                    const epTag = `EP ${String(epNum).padStart(2, '0')}`;
                    if (!downloadedEpisodesList.includes(epTag)) {
                        downloadedEpisodesList.push(epTag);
                    }
                }

                if (!detectedMediaTitle) {
                    detectedMediaTitle = extractTitleFromFilename(finalFileName);
                }

                // Delete temporary file
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
            }
        }

        // ── Single Consolidated Completion Message ──
        if (totalBytesAllItems > 0) {
            let totalSizeStr = '';
            if (totalBytesAllItems >= 1024 * 1024 * 1024) {
                totalSizeStr = `${(totalBytesAllItems / (1024 * 1024 * 1024)).toFixed(2)} GB`;
            } else {
                totalSizeStr = `${(totalBytesAllItems / (1024 * 1024)).toFixed(2)} MB`;
            }

            if (isSeriesDownload || downloadedEpisodesList.length > 0 || items.length > 1) {
                downloadedEpisodesList.sort((a, b) => {
                    const numA = parseInt(a.replace(/\D/g, ''), 10);
                    const numB = parseInt(b.replace(/\D/g, ''), 10);
                    return numA - numB;
                });

                const showTitle = detectedMediaTitle || 'Series';
                const epStr = downloadedEpisodesList.length > 0 ? downloadedEpisodesList.join(', ') : 'All Episodes';

                const completionMsg = `✅ *Download Completed!*\n` +
                                      `🎬 *Title:* *${showTitle}*\n` +
                                      `📺 *Episodes:* *${epStr}*`;
                try { await reply(completionMsg); } catch (_) {}
            } else {
                const movieTitle = detectedMediaTitle || 'Movie';
                const completionMsg = `✅ *Download Completed!*\n` +
                                      `🎬 *Title:* *${movieTitle}*\n` +
                                      `📦 *Size:* *${totalSizeStr}*`;
                try { await reply(completionMsg); } catch (_) {}
            }
        }

    } catch (error) {
        if ((abortSignal && abortSignal.aborted) || error.message === 'Aborted' || error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
            console.log('[DanieDownload] Download task aborted silently.');
            throw new Error('Aborted');
        }
        console.error('Download command error:', error);
        if (!silentErrors) {
            try {
                await reply(`❌ *Download failed.* ${error.message}\n\n👉 Please try *"All Episodes"* / Batch Zip or select another episode.`);
            } catch (replyErr) {
                console.error('[DanieDownload] Failed to send error reply (connection likely closed):', replyErr.message);
            }
        }
        throw error;
    }
}

// Minimal globalProgressState stub — used internally by StreamIMDB inline progress edits only
let globalProgressState = {
    active: false,
    fileName: '',
    quality: '',
    downloadedMB: 0,
    totalEstMB: 0,
    speedMBs: 0,
    percentage: 0,
    phaseText: 'Idle',
    statusMsg: null
};

async function pCommandHandler(conn, mek, from, senderJid, q, reply, abortSignal = null, activeDownloadRef = null) {
    console.log("=== P COMMAND TRIGGERED ===");
    console.log("q:", q);
    try {
        if (!q) {
            return reply(
                'R Please provide a TMDB link and download url(s)!\n\n' +
                '*Usage:*\n' +
                '`.p https://www.themoviedb.org/movie/550 = https://example.com/file1.mp4`\n' +
                '`.p https://www.themoviedb.org/movie/550 = https://example.com/file1.mp4, Episode 2 = https://example.com/file2.mp4`'
            );
        }

        const updatePStatus = async (textMsg) => {
            try { await reply(textMsg); } catch (_) {}
        };

        const items = q.split(',').map(item => item.trim()).filter(Boolean);
        
        let { customFilename: firstCustomName, url: firstUrl } = parseDownloadItem(items[0]);
        let tmdb = null;
        let mediaType = 'movie';
        let specifiedSeason = null;

        const targetUrlStr = firstCustomName || firstUrl || '';
        if (/themoviedb\.org\/(movie|tv)\/(\d+)/i.test(targetUrlStr)) {
            const match = targetUrlStr.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
            mediaType = match[1];
            const tmdbId = match[2];
            const seasonMatch = targetUrlStr.match(/\/season\/(\d+)/i);
            specifiedSeason = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
            tmdb = await fetchTmdbById(tmdbId, mediaType, specifiedSeason);
        } else if (firstUrl && firstUrl.startsWith('http')) {
            let imdbId = null;
            let title = firstCustomName || '';
            try {
                const scrapeInfo = await scrapePostPage(firstUrl);
                if (scrapeInfo) {
                    if (scrapeInfo.imdbId) imdbId = scrapeInfo.imdbId;
                    if (scrapeInfo.title) title = scrapeInfo.title;
                }
            } catch (_) {}
            tmdb = await fetchTmdbMetadata(title || firstUrl, 'movie', imdbId);
        }

        if (!tmdb) {
            return updatePStatus('❌ Error: Could not fetch TMDB metadata for that URL.');
        }

        const settings = loadSettings();
        const { activeTargets, primaryJid, destLabel } = getActiveTargetsAndPrimary(settings, senderJid);
        const destJid = primaryJid;

        // Auto-register to Daily Releases Tracker (1 AM reset)
        try {
            const { addDailyRelease } = require('../Utils/daily_releases');
            let sLabel = null;
            if (mediaType === 'tv') {
                if (specifiedSeason !== null) {
                    sLabel = `S${String(specifiedSeason).padStart(2, '0')}`;
                } else if (tmdb.seasons && tmdb.seasons.length > 0) {
                    const validS = tmdb.seasons.filter(s => s.season_number > 0);
                    if (validS.length > 0) {
                        const minS = Math.min(...validS.map(s => s.season_number));
                        sLabel = `S${String(minS).padStart(2, '0')}`;
                    }
                }
            }
            addDailyRelease({
                title: tmdb.title,
                year: tmdb.year,
                season: sLabel,
                isSeries: mediaType === 'tv',
                groupJid: destJid,
                source: 'p_command'
            });
        } catch (releaseErr) {
            console.warn('[DanieDownload] Daily releases auto-track error:', releaseErr.message);
        }

        // Track this post for per-group .qlist
        try {
            trackGroupPost(destJid, {
                title: tmdb.title,
                year: tmdb.year,
                season: specifiedSeason ? `S${String(specifiedSeason).padStart(2, '0')}` : null,
                isSeries: mediaType === 'tv'
            });
        } catch (_) {}

        // 1. Format details message
        let seasonText = '';
        let episodeText = '';
        if (mediaType === 'tv') {
            if (specifiedSeason !== null) {
                const targetSeason = tmdb.seasons.find(s => s.season_number === specifiedSeason);
                const epCount = targetSeason ? targetSeason.episode_count : 0;
                const sLabel = `S${String(specifiedSeason).padStart(2, '0')}`;
                seasonText = `📺 *Season:* *${sLabel}*\n`;
                episodeText = `🔢 *Episodes:* *E01 - E${String(epCount).padStart(2, '0')}*\n`;
                
                if (targetSeason && targetSeason.overview) {
                    tmdb.overview = targetSeason.overview;
                }
            } else {
                const validSeasons = tmdb.seasons.filter(s => s.season_number > 0);
                if (validSeasons.length > 0) {
                    const minSeason = Math.min(...validSeasons.map(s => s.season_number));
                    const maxSeason = Math.max(...validSeasons.map(s => s.season_number));
                    const minLabel = `S${String(minSeason).padStart(2, '0')}`;
                    const maxLabel = `S${String(maxSeason).padStart(2, '0')}`;
                    
                    if (minSeason === maxSeason) {
                        seasonText = `📺 *Season:* *${minLabel}*\n`;
                    } else {
                        seasonText = `📺 *Season:* *${minLabel} - ${maxLabel}*\n`;
                    }
                    
                    episodeText = `🔢 *Episodes:*\n`;
                    validSeasons.forEach(s => {
                        const epCount = s.episode_count;
                        episodeText += `   • Season ${s.season_number}: *E01 - E${String(epCount).padStart(2, '0')}*\n`;
                    });
                }
            }
        }

        let detailsMessage = `📝 *Title:* *${tmdb.title}*\n` +
                             `📅 *Year:* *${tmdb.year}*\n`;
        if (seasonText) detailsMessage += seasonText;
        detailsMessage += `🎭 *Genre:* *${tmdb.genres}*\n`;
        if (episodeText) detailsMessage += episodeText;
        detailsMessage += `───────────────────\n` +
                             `👑 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 』* 👑`;

        // 2. Download and send poster image first to configured destJid
        const posterUrl = tmdb.posterUrl;
        let posterSent = false;
        if (posterUrl) {
            const tempPosterPath = path.join(__dirname, 'tmp_poster_' + Date.now() + '.jpg');
            try {
                const parsedPosterUrl = new URL(posterUrl);
                const posterResponse = await axios({
                    method: 'get',
                    url: posterUrl,
                    responseType: 'stream',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/*',
                        'Referer': parsedPosterUrl.origin + '/'
                    },
                    timeout: 30000
                });
                
                const posterWriter = fs.createWriteStream(tempPosterPath);
                posterResponse.data.pipe(posterWriter);
                
                await new Promise((resolve, reject) => {
                    posterWriter.on('finish', resolve);
                    posterWriter.on('error', reject);
                });
                
                if (fs.existsSync(tempPosterPath)) {
                    await sendAndForwardFile(conn, activeTargets, {
                        image: { url: tempPosterPath },
                        caption: detailsMessage
                    }, { quoted: destJid === from ? mek : null, from, senderJid });
                    posterSent = true;
                    try { if (fs.existsSync(tempPosterPath)) fs.unlinkSync(tempPosterPath); } catch (_) {}
                }
            } catch (err) {
                console.error('[DanieDownload] Failed to download/send local TMDB poster:', err.message);
                if (fs.existsSync(tempPosterPath)) {
                    try { if (fs.existsSync(tempPosterPath)) fs.unlinkSync(tempPosterPath); } catch (_) {}
                }
            }
        }

        if (!posterSent) {
            console.log('[DanieDownload] Sending TMDB details caption as text fallback...');
            try {
                await sendAndForwardFile(conn, activeTargets, {
                    text: detailsMessage
                }, { quoted: destJid === from ? mek : null, from, senderJid });
            } catch (txtErr) {
                console.error('[DanieDownload] Failed to send TMDB text details fallback:', txtErr.message);
            }
        }
        
        await updatePStatus(` *[1/3] TMDB details & poster sent to:* *${destLabel}*`, true);

        // 3. Fetch and send trailer video from YouTube if available
        if (tmdb && tmdb.trailerUrl) {
            console.log(`[DanieDownload] Fetching trailer video for ${tmdb.title} (${tmdb.trailerUrl})...`);
            const tempTrailerPath = path.join(__dirname, 'tmp_trailer_' + Date.now() + '.mp4');
            try {
                const directVideoUrl = await downloadYoutubeVideoUrl(tmdb.trailerUrl);
                if (directVideoUrl) {
                    await updatePStatus(`⏳ *[2/3] Downloading trailer video from YouTube...*`, true);
                    const fetch = require('node-fetch');
                    const videoResponse = await fetch(directVideoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                            'Referer': 'https://frame.y2meta-uk.com/',
                            'Origin': 'https://frame.y2meta-uk.com',
                            'Accept': '*/*'
                        }
                    });

                    if (!videoResponse.ok) {
                        throw new Error(`Trailer video download failed with status ${videoResponse.status}`);
                    }

                    const videoWriter = fs.createWriteStream(tempTrailerPath);
                    await new Promise((resolve, reject) => {
                        videoResponse.body.pipe(videoWriter);
                        videoResponse.body.on('error', reject);
                        videoWriter.on('finish', resolve);
                    });

                    if (fs.existsSync(tempTrailerPath)) {
                        const stats = fs.statSync(tempTrailerPath);
                        if (stats.size > 0) {
                            console.log(`[DanieDownload] Remuxing trailer video to faststart MP4 for WhatsApp...`);
                            await remuxFileToFaststart(tempTrailerPath);

                            console.log(`[DanieDownload] Generating video preview thumbnail...`);
                            let backdropBuf = null;
                            if (tmdb && tmdb.backdropUrl) {
                                try {
                                    const bdRes = await axios.get(tmdb.backdropUrl, { responseType: 'arraybuffer', timeout: 10000 });
                                    if (bdRes.data) backdropBuf = await compressToJpegThumbnail(Buffer.from(bdRes.data));
                                } catch (_) {}
                            }

                            let rawThumb = generateVideoThumbnailBuffer(tempTrailerPath);
                            if (rawThumb) {
                                rawThumb = await compressToJpegThumbnail(rawThumb);
                            }
                            const videoThumbBuf = rawThumb || backdropBuf;

                            const videoPayload = {
                                video: { url: tempTrailerPath },
                                caption: `🎬 *Trailer:* *${tmdb.title}*`
                            };
                            if (videoThumbBuf) {
                                videoPayload.jpegThumbnail = videoThumbBuf;
                            }

                            await sendAndForwardFile(conn, activeTargets, videoPayload, { quoted: destJid === from ? mek : null, from, senderJid });
                            console.log(`[DanieDownload] Successfully sent trailer video for ${tmdb.title}`);
                            await updatePStatus(`✅ *[2/3] Trailer video sent to:* *${destLabel}*`, true);
                        }
                    }
                } else {
                    console.log(`[DanieDownload] Could not resolve direct YouTube video URL for trailer. Skipping trailer.`);
                }
            } catch (err) {
                console.error('[DanieDownload] Trailer download/upload failed (skipping):', err.message);
            } finally {
                try { if (fs.existsSync(tempTrailerPath)) fs.unlinkSync(tempTrailerPath); } catch (_) {}
            }
        } else {
            console.log(`[DanieDownload] No TMDB trailer found for ${tmdb ? tmdb.title : 'title'}. Skipping trailer.`);
        }

        // Check if there are media download links provided in .p command
        const downloadItems = [];
        if (firstCustomName && /themoviedb\.org/i.test(firstCustomName) && firstUrl && !/themoviedb\.org/i.test(firstUrl)) {
            downloadItems.push(`${tmdb.title} = ${firstUrl}`);
        }
        for (let i = 1; i < items.length; i++) {
            downloadItems.push(items[i]);
        }

        if (downloadItems.length > 0) {
            const downloadQuery = downloadItems.join(', ');
            console.log(`[DanieWatch] Executing media downloads for .p command: ${downloadQuery}`);
            await updatePStatus(`⏳ *[3/3] Initializing media download(s)...*`, true);
            await downloadCommandHandler(conn, mek, from, senderJid, downloadQuery, reply, abortSignal, activeDownloadRef, null, true);
            await updatePStatus(` *[3/3] Completed processing for:* *${tmdb.title}*`, true);
        } else {
            await updatePStatus(` *Processing completed for:* *${tmdb.title}*`, true);
        }

    } catch (error) {
        console.error('P command error:', error);
        reply(`❌ Failed to process P command: ${error.message}`);
    }
}

cmd({
    pattern: 'd',
    react: '=',
    desc: 'Downloads files. Supports multiple files separated by commas, Vegamovies/Rogmovies/HDHub4u auto-scraping, and TMDB integration.',
    category: 'download',
    use: '.d <link>  OR  .d name = <link>  OR  .d name1 = link1, name2 link2',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    // Delegate to DANIE_COMMANDS['d'] which properly handles group shortcuts (.d e link),
    // task queuing, and link title fetching. Falls back to direct handler if DANIE_COMMANDS
    // hasn't been populated yet (should never happen at runtime).
    if (typeof DANIE_COMMANDS['d'] === 'function') {
        await DANIE_COMMANDS['d'](conn, mek, from, senderJid, q, reply);
    } else {
        await downloadCommandHandler(conn, mek, from, senderJid, q, reply);
    }
});

cmd({
    pattern: 'p',
    react: '<',
    desc: 'Downloads files with TMDB metadata. The first item\'s name should be a TMDB URL.',
    category: 'download',
    use: '.p <TMDB_URL> = <link1>, <name2> = <link2>, ...',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    // Delegate to DANIE_COMMANDS['p'] which properly handles group shortcuts (.p e link),
    // task queuing, and link title fetching. Falls back to direct handler if DANIE_COMMANDS
    // hasn't been populated yet (should never happen at runtime).
    if (typeof DANIE_COMMANDS['p'] === 'function') {
        await DANIE_COMMANDS['p'](conn, mek, from, senderJid, q, reply);
    } else {
        await pCommandHandler(conn, mek, from, senderJid, q, reply);
    }
});

// .status / .s / .progress command removed per user request

// =========================================================================
//  .groupid  unchanged from original
// =========================================================================
cmd({
    pattern: 'groupid',
    react: '<',
    desc: 'Get the ID of the current group/chat.',
    category: 'download',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    try {
        await reply(`*Current Chat ID:* \`${from}\``);
    } catch (error) {
        console.error(error);
        reply(`❌ Failed to get JID: ${error.message}`);
    }
});

// =========================================================================
//  .status  Show current download destination configuration
// =========================================================================
cmd({
    pattern: 'dlstatus',
    alias: ['downloadstatus', 'dlconfig'],
    react: '📊',
    desc: 'Show current download destination configuration.',
    category: 'download',
    use: '.dlstatus',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    try {
        const senderJid = m.sender || mek.sender || from;
        const settings = loadSettings();
        const { activeTargets } = getActiveTargetsAndPrimary(settings, senderJid);
        let targetText = '';
        if (activeTargets.length > 0) {
            activeTargets.forEach((t, idx) => {
                const icon = t.type === 'group' ? '👥' : '👤';
                targetText += `│   ${idx + 1}. ${icon} *${t.name}* (${t.jid})\n`;
            });
        } else {
            targetText = `│   _Private Chat (+${cleanJid(senderJid).split('@')[0]})_\n`;
        }
        await reply(
            `╭─── 📊 *DOWNLOAD CONFIG STATUS* 📊 ───╮\n\n` +
            `┌─❒ *Current Settings*\n` +
            `│ ⚙️ *Mode:* ${settings.mode === 'group' ? '👥 Group' : '👤 Private'}\n` +
            `├─❒ *Active Target Receiver(s)*\n` +
            `${targetText}` +
            `└───────────────\n\n` +
            `💡 _Use \`.config\` to change destination settings._`
        );
    } catch (error) {
        reply(`❌ Error: ${error.message}`);
    }
});

// =========================================================================
//  REGISTER DIRECT COMMAND HANDLERS
//  These bypass the obfuscated framework entirely via messages.upsert
// =========================================================================
// .s / .status / .progress commands removed per user request

const { handleAiSearchCommand, pendingConfirmations } = require('./ai_search');

DANIE_COMMANDS['search'] = async (conn, mek, from, senderJid, args, reply) => {
    const qText = typeof args === 'string' ? args : (Array.isArray(args) ? args.join(' ') : '');
    await handleAiSearchCommand(conn, mek, [qText], qText);
};
DANIE_COMMANDS['aisearch'] = DANIE_COMMANDS['search'];

DANIE_COMMANDS['confirm'] = async (conn, mek, from, senderJid, args, reply) => {
    let targetConf = null;
    let targetKey = null;
    for (const [key, conf] of pendingConfirmations.entries()) {
        if (conf.chatId === from) {
            targetConf = conf;
            targetKey = key;
            break;
        }
    }

    if (!targetConf) {
        return reply('❌ No pending download confirmation found for this chat.');
    }

    pendingConfirmations.delete(targetKey);
    await reply(`🚀 *Starting download & delivery for:* *${targetConf.title}*...`);
    await downloadCommandHandler(conn, mek, from, senderJid, `${targetConf.title} = ${targetConf.downloadUrl}`, reply);
};

DANIE_COMMANDS['d'] = async (conn, mek, from, senderJid, args, reply) => {
    const qText = typeof args === 'string' ? args : (Array.isArray(args) ? args.join(' ') : '');
    await downloadCommandHandler(conn, mek, from, senderJid, qText, reply);
};

DANIE_COMMANDS['p'] = async (conn, mek, from, senderJid, args, reply) => {
    const qText = typeof args === 'string' ? args : (Array.isArray(args) ? args.join(' ') : '');
    await pCommandHandler(conn, mek, from, senderJid, qText, reply);
};

DANIE_COMMANDS['domain'] = async (conn, mek, from, senderJid, args, reply) => {
    initUpsertListener(conn);
    const cleanSender = cleanJid(senderJid);
    const argText = typeof args === 'string' ? args.trim() : '';

    if (argText) {
        const parts = argText.split(/\s+/);
        const choice = parts[0];
        const val = parts.slice(1).join(' ');

        if (!val) {
            return reply(`❌ *Usage:* \`.domain <1|2|3> <value>\`\n\n*Examples:*\n• \`.domain 1 https://new2.rogmovies.click/\`\n• \`.domain 2 https://new2.vegamovies.futbol/\`\n• \`.domain 3 10gbps, fslv2, fsl, vcloud\``);
        }

        const res = setDomain(choice, val);
        if (!res.success) {
            return reply(`❌ ${res.error}`);
        }

        delete pendingDomainSelection[cleanSender];
        if (res.hostPriority) {
            return reply(`✅ *Host Link Priority Updated Successfully!*\n\n• *New Order:* ${res.hostPriority.join(' ➔ ')}\n\n*Saved permanently to bot storage.*`);
        }
        return reply(`✅ *Domain Updated Successfully!*\n\n• *Site:* ${res.site}\n• *New URL:* \`${res.url}\` \n\n*Saved permanently to bot storage.*`);
    }

    const domains = getDomains();
    pendingDomainSelection[cleanSender] = { timestamp: Date.now() };

    const statusMsg = `🌐 *Current Search & Host Configuration:*

1️⃣ *Rogmovies Domain:* \`${domains.rogmovies}\`
2️⃣ *Vegamovies Domain:* \`${domains.vegamovies}\`
3️⃣ *Host Link Priority:* \`${(domains.hostPriority || []).join(' ➔ ')}\`

💡 *To update settings:*
• Reply \`1 <new_url>\` for Rogmovies Domain
• Reply \`2 <new_url>\` for Vegamovies Domain
• Reply \`3 <host1, host2, ...>\` to reorder Link Priority
  _(Available hosts: 10gbps, fslv2, fsl, vcloud, gofile, pixeldrain)_`;

    return reply(statusMsg);
};
DANIE_COMMANDS['domains'] = DANIE_COMMANDS['domain'];

DANIE_COMMANDS['config'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can use this command.');
    initUpsertListener(conn);
    const cleanSender = cleanJid(senderJid);

    let groupsObj = {};
    try {
        groupsObj = await safeFetchParticipatingGroups(conn);
    } catch (_) {}

    const groups = Object.values(groupsObj).map(g => ({
        jid: g.id,
        subject: g.subject || 'Unknown Group'
    }));

    // ── FAST QUEUE-BASED GROUP SWITCHING ──
    // If args is a pure number (e.g. `.config 4`), queue a group-switch task
    const argText = (args || '').trim();
    const argNum = parseInt(argText, 10);
    if (argText && !isNaN(argNum) && argNum >= 1 && argNum <= groups.length && /^\d+$/.test(argText)) {
        const chosen = groups[argNum - 1];
        const chosenJid = cleanJid(chosen.jid);
        const chosenName = chosen.subject;

        // If queue is empty and no active task, apply switch immediately (no queuing needed)
        if (!globalTaskQueue.activeTask && globalTaskQueue.queue.length === 0) {
            const newSettings = {
                mode: 'group',
                groupJid: chosenJid,
                groupName: chosenName,
                privateJid: '',
                privateName: '',
                targets: [{ jid: chosenJid, name: chosenName, type: 'group' }]
            };
            saveSettings(newSettings);
            delete pendingConfig[cleanSender];
            return reply(`✅ *Group switched to:* 👥 *${chosenName}*\n\n_All .p and .d commands will now send to this group._`);
        }

        // Queue is busy — add a config-switch task to the queue
        const configTask = {
            type: 'config_switch',
            description: `🔀 Group Switch → *${chosenName}*`,
            targetGroupName: chosenName,
            commandText: `.config ${argText}`,
            senderJid,
            from,
            conn,
            executeFn: async (signal, ref) => {
                // Apply the group switch when this task is processed
                const newSettings = {
                    mode: 'group',
                    groupJid: chosenJid,
                    groupName: chosenName,
                    privateJid: '',
                    privateName: '',
                    targets: [{ jid: chosenJid, name: chosenName, type: 'group' }]
                };
                saveSettings(newSettings);
                console.log(`[QueueManager] Config switch applied: Group → ${chosenName} (${chosenJid})`);
                try {
                    await reply(`✅ *Group switched to:* 👥 *${chosenName}*\n\n_Subsequent tasks will send to this group._`);
                } catch (_) {}
            }
        };

        const queuedTask = globalTaskQueue.add(configTask);
        delete pendingConfig[cleanSender];
        return reply(`🔀 *Group Switch Queued* (Position #${globalTaskQueue.queue.length}):\n👥 *${chosenName}*\n_Will switch after pending tasks complete._`);
    }

    // ── INTERACTIVE CONFIG (no number arg or non-numeric arg) ──
    pendingConfig[cleanSender] = { step: 'combined_config', groups, messageId: null };

    if (argText && !/^\d+$/.test(argText)) {
        return handleConfigReply(conn, mek, null, senderJid, argText, reply);
    }

    const current = loadSettings();
    let targetText = '';
    if (current.targets && current.targets.length > 0) {
        current.targets.forEach((t, idx) => {
            const icon = t.type === 'group' ? '👥' : '👤';
            targetText += `│   ${idx + 1}. ${icon} *${t.name}* (${t.jid})\n`;
        });
    } else if (current.mode === 'group' && current.groupJid) {
        targetText += `│   1. 👥 *${current.groupName || 'Group'}* (${current.groupJid})\n`;
    } else {
        targetText = `│   _Private Chat (+${cleanSender.split('@')[0]})_\n`;
    }

    let groupListText = '';
    if (groups.length > 0) {
        groups.forEach((g, i) => {
            // Mark the currently active group with a ✅
            const isActive = current.targets && current.targets.some(t => cleanJid(t.jid) === cleanJid(g.jid));
            const activeMarker = isActive ? ' ✅' : '';
            groupListText += `│   \`${i + 1}\` • 👥 ${g.subject}${activeMarker}\n`;
        });
    } else {
        groupListText = '│   _No active groups found._\n';
    }

    const sent = await reply(
        `╭─── ⚙️ *RECEIVER CONFIG* ⚙️ ───╮\n\n` +
        `┌─❒ *Current Active Receiver(s)*\n` +
        `${targetText}` +
        `└───────────────\n\n` +
        `┌─❒ *Available Groups (${groups.length})*\n` +
        `${groupListText}` +
        `└───────────────\n\n` +
        `💡 *How to Set Receivers:*\n` +
        `  • \`.config 4\` — Quick-switch to group #4 (queued if busy)\n` +
        `  • Reply with group number(s) (e.g. \`1\`, \`1, 2\`, \`1-3\`, or \`all\`)\n` +
        `  • Reply with phone number(s) in international format (e.g. \`923013068663\`)\n` +
        `  • Combine both! (e.g. \`1, +923013068663\`)\n` +
        `  • Reply \`clear\` to reset back to Private Chat.\n\n` +
        `_Reply to this message with your choice(s)._`
    );
    if (sent && sent.key) {
        pendingConfig[cleanSender].messageId = sent.key.id;
    }
};

DANIE_COMMANDS['setgroup'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can use this command.');
    initUpsertListener(conn);
    let groupsObj;
    try { groupsObj = await conn.groupFetchAllParticipating(); } catch (err) { return reply(`❌ Failed to fetch groups: ${err.message}`); }
    const groups = Object.values(groupsObj).map(g => ({ jid: g.id, subject: g.subject || 'Unknown Group' }));
    if (groups.length === 0) return reply('❌ No active groups found.');
    const cleanSender = cleanJid(senderJid);
    const arg = (args || '').trim().toLowerCase();
    if (!arg || arg === 'list') {
        pendingConfig[cleanSender] = { step: 'group', groups, messageId: null };
        let list = `╭─── 👥 *AVAILABLE GROUPS* 👥 ───╮\n\n`;
        groups.forEach((g, i) => { list += `  \`${i + 1}\` • 👥 ${g.subject}\n`; });
        list += `\n_Reply with just the number to select._`;
        const sent = await reply(list);
        if (sent && sent.key) {
            pendingConfig[cleanSender].messageId = sent.key.id;
        }
        return sent;
    }
    const num = parseInt(arg, 10);
    if (isNaN(num) || num < 1 || num > groups.length) return reply(`❌ Invalid selection. Use a number from 1 to ${groups.length}.`);
    const chosen = groups[num - 1];
    saveSettings({
        mode: 'group',
        groupJid: cleanJid(chosen.jid),
        groupName: chosen.subject,
        privateJid: '',
        privateName: '',
        targets: [{ jid: cleanJid(chosen.jid), name: chosen.subject, type: 'group' }]
    });
    return reply(`✅ Download target set to group:\n👥 *${chosen.subject}*\n\`${chosen.jid}\``);
};

DANIE_COMMANDS['groupid'] = async (conn, mek, from, senderJid, args, reply) => {
    await reply(`💬 *Current Chat ID:* \`${from}\``);
};

DANIE_COMMANDS['jid'] = async (conn, mek, from, senderJid, args, reply) => {
    const targetJid = cleanJid(from);
    const sender = cleanJid(senderJid || from);
    await reply(`💬 *Current Chat JID:* \`${targetJid}\`\n👤 *Your JID:* \`${sender}\``);
};

const { formatDailyReleaseList, formatDailyReleaseListForDate, formatHistoryMenu, getAvailableDays, getLastSentMessage, setLastSentMessage, clearLastSentMessage } = require('../Utils/daily_releases');

DANIE_COMMANDS['createlist'] = async (conn, mek, from, senderJid, args, reply) => {
    const settings = loadSettings();
    const groupName = settings.groupName || (settings.targets && settings.targets[0] ? settings.targets[0].name : '');
    const groupJid = settings.groupJid || (settings.targets && settings.targets[0] ? settings.targets[0].jid : '');

    // Must have a configured group target
    if (!groupJid || !groupJid.endsWith('@g.us')) {
        return reply('❌ *No group configured!*\n\nPlease set a target group first with `.config` or `.setgroup`.');
    }

    const listMsg = formatDailyReleaseList(groupName);

    // 1. Delete previous same-day message (if any)
    const lastSent = getLastSentMessage();
    if (lastSent && lastSent.key) {
        try {
            await conn.sendMessage(lastSent.key.remoteJid, { delete: lastSent.key });
            console.log(`[DailyReleases] Deleted previous same-day message: ${lastSent.key.id}`);
        } catch (delErr) {
            console.warn(`[DailyReleases] Could not delete previous message: ${delErr.message}`);
        }
    }

    // 2. Fetch all group participants for @all mention
    let allJids = [];
    try {
        const metadata = await conn.groupMetadata(groupJid);
        if (metadata && metadata.participants) {
            allJids = metadata.participants.map(p => p.id);
        }
    } catch (metaErr) {
        console.warn(`[DailyReleases] Could not fetch group metadata: ${metaErr.message}`);
    }

    // 3. Send to the group with @all mentions
    let sentMsg;
    try {
        sentMsg = await conn.sendMessage(groupJid, {
            text: listMsg,
            mentions: allJids
        });
        console.log(`[DailyReleases] Sent daily release list to group ${groupJid} (mentions: ${allJids.length})`);
    } catch (sendErr) {
        console.error(`[DailyReleases] Failed to send list to group: ${sendErr.message}`);
        return reply('❌ Failed to send the daily list to the group. Please try again.');
    }

    // 4. Pin the message in the group
    if (sentMsg && sentMsg.key) {
        try {
            await conn.chatModify(
                { pin: true },
                groupJid,
                [sentMsg.key]
            );
            console.log(`[DailyReleases] Pinned daily release message in group ${groupJid}`);
        } catch (pinErr) {
            console.warn(`[DailyReleases] Could not pin message (bot may not be admin): ${pinErr.message}`);
            // Try alternative pinning method
            try {
                await conn.sendMessage(groupJid, {
                    pin: {
                        type: 1, // PIN
                        time: 604800 // 7 days
                    }
                }, { quoted: sentMsg });
            } catch (_) {}
        }
    }

    // 5. Save the sent message key for future same-day deletion
    if (sentMsg && sentMsg.key) {
        setLastSentMessage(sentMsg.key);
    }

    // 6. Confirm in private chat
    await reply(`✅ *Daily release list sent to group!*\n📌 Message pinned.\n👥 *${allJids.length}* members mentioned.`);
};

DANIE_COMMANDS['list'] = DANIE_COMMANDS['createlist'];
DANIE_COMMANDS['todaylist'] = DANIE_COMMANDS['createlist'];
DANIE_COMMANDS['todayrelease'] = DANIE_COMMANDS['createlist'];
DANIE_COMMANDS['daily'] = DANIE_COMMANDS['createlist'];

DANIE_COMMANDS['create'] = async (conn, mek, from, senderJid, args, reply) => {
    if (args && args.trim().toLowerCase().startsWith('list')) {
        return DANIE_COMMANDS['createlist'](conn, mek, from, senderJid, '', reply);
    }
    await reply('💡 *Usage:* `.create list` to show today\'s releases list.');
};

// =========================================================================
//  .history — 7-Day Release Archive Day Picker
// =========================================================================
DANIE_COMMANDS['history'] = async (conn, mek, from, senderJid, args, reply) => {
    const cleanSender = cleanJid(senderJid);
    const days = getAvailableDays();

    if (days.length === 0) {
        return reply('📜 *No release history found in the last 7 days.*\n\nUse `.p` to post releases first.');
    }

    // If user provided a number directly (e.g. `.history 1`), handle it immediately
    if (args && /^\d+$/.test(args.trim())) {
        const idx = parseInt(args.trim(), 10) - 1;
        if (idx >= 0 && idx < days.length) {
            return sendHistoryDayList(conn, mek, from, senderJid, days[idx].dateKey, reply);
        }
    }

    // Show interactive day picker menu
    const menuText = formatHistoryMenu();
    const sent = await reply(menuText);

    // Store pending state for reply handling
    pendingHistory[cleanSender] = {
        step: 'day_selection',
        days: days,
        messageId: sent && sent.key ? sent.key.id : null
    };
};
DANIE_COMMANDS['weeklist'] = DANIE_COMMANDS['history'];
DANIE_COMMANDS['7days'] = DANIE_COMMANDS['history'];
DANIE_COMMANDS['archive'] = DANIE_COMMANDS['history'];

DANIE_COMMANDS['listque'] = async (conn, mek, from, senderJid, args, reply) => {
    const task = {
        description: `📋 Send Per-Group Release Lists (End of Queue)`,
        commandText: '.listque',
        isListQue: true,
        conn,
        executeFn: async (signal, ref) => {
            // ── PER-GROUP RELEASE LIST DISPATCH ──
            // Find all groups that received .p posts today and send each group its own list
            try {
                const { getGroupsWithReleasesToday, formatDailyReleaseListForGroup } = require('../Utils/daily_releases');
                const groupsMap = getGroupsWithReleasesToday();

                if (groupsMap.size === 0) {
                    await reply('📋 *No groups received .p posts today.* No release lists to send.');
                    return;
                }

                let sentCount = 0;
                let groupSummaries = [];

                for (const [groupJid, releases] of groupsMap) {
                    try {
                        // Get group name from metadata
                        let groupName = groupJid;
                        try {
                            const metadata = await conn.groupMetadata(groupJid);
                            groupName = metadata.subject || groupJid;
                        } catch (_) {
                            // Try loading from settings as fallback
                            const curSettings = loadSettings();
                            const target = (curSettings.targets || []).find(t => t.jid === groupJid);
                            if (target) groupName = target.name;
                        }

                        // Format the release list for this specific group
                        const listMsg = formatDailyReleaseListForGroup(groupJid, groupName);

                        // Fetch all group participants for @all mention
                        let allJids = [];
                        try {
                            const metadata = await conn.groupMetadata(groupJid);
                            if (metadata && metadata.participants) {
                                allJids = metadata.participants.map(p => p.id);
                            }
                        } catch (_) {}

                        // Send to the group with @all mentions (no pinning)
                        await conn.sendMessage(groupJid, {
                            text: listMsg,
                            mentions: allJids
                        });

                        sentCount++;
                        groupSummaries.push(`  👥 *${groupName}* — ${releases.length} post(s)`);
                        console.log(`[QList] Sent per-group release list to ${groupName} (${groupJid}) with ${releases.length} posts, ${allJids.length} mentions`);

                        // Small delay between groups to avoid rate limiting
                        if (groupsMap.size > 1) {
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (groupErr) {
                        console.error(`[QList] Failed to send list to group ${groupJid}:`, groupErr.message);
                        groupSummaries.push(`  ❌ *${groupJid}* — Failed: ${groupErr.message}`);
                    }
                }

                // Send confirmation to private chat
                let confirmMsg = `╭─── 📋 *PER-GROUP LISTS SENT* 📋 ───╮\n\n`;
                confirmMsg += `✅ Sent release lists to *${sentCount}/${groupsMap.size}* group(s):\n\n`;
                confirmMsg += groupSummaries.join('\n');
                confirmMsg += `\n\n╰───────────────────╯`;
                await reply(confirmMsg);

            } catch (qlistErr) {
                console.error('[QList] Per-group release list error:', qlistErr.message);
                // Fallback to legacy single-group createlist
                if (typeof DANIE_COMMANDS['createlist'] === 'function') {
                    await DANIE_COMMANDS['createlist'](conn, mek, from, senderJid, '', reply);
                }
            }
        }
    };

    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        await reply(`📋 *Per-Group Release Lists Queued at End of Queue* (Position #${globalTaskQueue.queue.length}):\n_Will send separate lists to each group that received .p posts after all pending tasks finish._`);
    }
};
DANIE_COMMANDS['quelist'] = DANIE_COMMANDS['listque'];
DANIE_COMMANDS['qlist'] = DANIE_COMMANDS['listque'];

/**
 * Handles user's reply to the .history day picker menu.
 * When a day number is selected, formats that day's list and sends to group.
 */
async function handleHistoryReply(conn, mek, from, senderJid, text, reply) {
    const cleanSender = cleanJid(senderJid);
    const state = pendingHistory[cleanSender];
    if (!state || !state.days) {
        delete pendingHistory[cleanSender];
        return;
    }

    const trimmed = text.trim();
    const idx = parseInt(trimmed, 10) - 1;

    if (isNaN(idx) || idx < 0 || idx >= state.days.length) {
        return reply(`❌ Invalid selection. Please reply with a number between 1 and ${state.days.length}.`);
    }

    const selectedDateKey = state.days[idx].dateKey;
    delete pendingHistory[cleanSender];

    await sendHistoryDayList(conn, mek, from, senderJid, selectedDateKey, reply);
}

/**
 * Sends a specific day's release list to the configured group with @all mention + pin.
 * Same behavior as .createlist but for a specific past date.
 */
async function sendHistoryDayList(conn, mek, from, senderJid, dateKey, reply) {
    const settings = loadSettings();
    const groupName = settings.groupName || (settings.targets && settings.targets[0] ? settings.targets[0].name : '');
    const groupJid = settings.groupJid || (settings.targets && settings.targets[0] ? settings.targets[0].jid : '');

    // Must have a configured group target
    if (!groupJid || !groupJid.endsWith('@g.us')) {
        return reply('❌ *No group configured!*\n\nPlease set a target group first with `.config` or `.setgroup`.');
    }

    const listMsg = formatDailyReleaseListForDate(dateKey, groupName);
    const { dateKeyToDisplayString } = require('../Utils/daily_releases');
    const displayDate = dateKeyToDisplayString(dateKey);

    // 1. Fetch all group participants for @all mention
    let allJids = [];
    try {
        const metadata = await conn.groupMetadata(groupJid);
        if (metadata && metadata.participants) {
            allJids = metadata.participants.map(p => p.id);
        }
    } catch (metaErr) {
        console.warn(`[History] Could not fetch group metadata: ${metaErr.message}`);
    }

    // 2. Send to the group with @all mentions
    let sentMsg;
    try {
        sentMsg = await conn.sendMessage(groupJid, {
            text: listMsg,
            mentions: allJids
        });
        console.log(`[History] Sent release list for ${dateKey} to group ${groupJid} (mentions: ${allJids.length})`);
    } catch (sendErr) {
        console.error(`[History] Failed to send list to group: ${sendErr.message}`);
        return reply('❌ Failed to send the release list to the group. Please try again.');
    }

    // 3. Pin the message in the group
    if (sentMsg && sentMsg.key) {
        try {
            await conn.chatModify(
                { pin: true },
                groupJid,
                [sentMsg.key]
            );
            console.log(`[History] Pinned release list message in group ${groupJid}`);
        } catch (pinErr) {
            console.warn(`[History] Could not pin message (bot may not be admin): ${pinErr.message}`);
            try {
                await conn.sendMessage(groupJid, {
                    pin: {
                        type: 1, // PIN
                        time: 604800 // 7 days
                    }
                }, { quoted: sentMsg });
            } catch (_) {}
        }
    }

    // 4. Confirm in private chat
    await reply(`✅ *Release list for ${displayDate} sent to group!*\n📌 Message pinned.\n👥 *${allJids.length}* members mentioned.`);
}

DANIE_COMMANDS['dlstatus'] = async (conn, mek, from, senderJid, args, reply) => {
    const settings = loadSettings();
    const { activeTargets } = getActiveTargetsAndPrimary(settings, senderJid);
    let targetText = '';
    if (activeTargets.length > 0) {
        activeTargets.forEach((t, idx) => {
            const icon = t.type === 'group' ? '👥' : '👤';
            targetText += `│   ${idx + 1}. ${icon} *${t.name}* (${t.jid})\n`;
        });
    } else {
        targetText = `│   _Private Chat (+${cleanJid(senderJid).split('@')[0]})_\n`;
    }
    await reply(
        `╭─── 📊 *DOWNLOAD CONFIG STATUS* 📊 ───╮\n\n` +
        `┌─❒ *Current Settings*\n` +
        `│ ⚙️ *Mode:* ${settings.mode === 'group' ? '👥 Group' : '👤 Private'}\n` +
        `├─❒ *Active Target Receiver(s)*\n` +
        `${targetText}` +
        `└───────────────\n\n` +
        `💡 _Use \`.config\` to change destination settings._`
    );
};
DANIE_COMMANDS['dlconfig'] = DANIE_COMMANDS['dlstatus'];
DANIE_COMMANDS['downloadstatus'] = DANIE_COMMANDS['dlstatus'];

DANIE_COMMANDS['d'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!args || !args.trim()) {
        return reply('❌ Please provide a download link!\n*Example:* \`.d https://example.com/file.mp4\`\n\n*Group shortcuts:* \`.d i link\` \`.d e link\` \`.d c link\` \`.d k link\` \`.d l link\`');
    }

    // Check for group shortcut letter (e.g. .d i link, .d e link)
    let shortcutGroup = null;
    let effectiveArgs = args.trim();
    const shortcutResult = extractGroupShortcut(args);
    if (shortcutResult) {
        shortcutGroup = shortcutResult.shortcut;
        effectiveArgs = shortcutResult.remainingArgs;
    }

    // Fetch proper title for queue display
    let linkTitle = 'Media File';
    let displayUrl = effectiveArgs;
    try {
        const fetched = await fetchLinkTitle(effectiveArgs);
        linkTitle = fetched.title || 'Media File';
        displayUrl = fetched.url || effectiveArgs;
    } catch (_) {
        linkTitle = getCleanFileNameFromUrl(effectiveArgs);
    }

    // Determine target group: shortcut overrides global config
    let currentGroupName = '';
    if (shortcutGroup) {
        currentGroupName = shortcutGroup.name;
    } else {
        try {
            const curSettings = loadSettings();
            if (curSettings.targets && curSettings.targets.length > 0) {
                const grpTarget = curSettings.targets.find(t => t.type === 'group');
                if (grpTarget) currentGroupName = grpTarget.name;
            } else if (curSettings.mode === 'group' && curSettings.groupName) {
                currentGroupName = curSettings.groupName;
            }
        } catch (_) {}
    }

    const task = {
        type: 'd_command',
        description: `📥 *${linkTitle}*`,
        linkUrl: displayUrl.length > 80 ? displayUrl.substring(0, 77) + '...' : displayUrl,
        targetGroupName: currentGroupName || undefined,
        commandText: `.d ${args}`,
        senderJid,
        from,
        executeFn: async (signal, ref) => {
            // If shortcut group specified, temporarily switch settings for this task
            let originalSettings = null;
            if (shortcutGroup) {
                originalSettings = loadSettings();
                const tempSettings = {
                    mode: 'group',
                    groupJid: shortcutGroup.jid,
                    groupName: shortcutGroup.name,
                    privateJid: '',
                    privateName: '',
                    targets: [{ jid: shortcutGroup.jid, name: shortcutGroup.name, type: 'group' }]
                };
                saveSettings(tempSettings);
            }
            try {
                await downloadCommandHandler(conn, mek, from, senderJid, effectiveArgs, reply, signal, ref);
            } finally {
                // Restore original settings after task completes (if shortcut was used)
                if (originalSettings) {
                    saveSettings(originalSettings);
                }
            }
        }
    };
    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        const groupLabel = currentGroupName ? `\n👥 → *${currentGroupName}*` : '';
        await reply(`📥 *Task Added to Queue* (Position #${globalTaskQueue.queue.length}):\n📌 *${linkTitle}*\n🔗 ${displayUrl.length > 80 ? displayUrl.substring(0, 77) + '...' : displayUrl}${groupLabel}`);
    }
};

DANIE_COMMANDS['p'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!args || !args.trim()) {
        return reply('❌ Please provide a TMDB link and download url(s)!\n*Example:* \`.p https://themoviedb.org/movie/123 = https://link.com\`\n\n*Group shortcuts:* \`.p i link\` \`.p e link\` \`.p c link\` \`.p k link\` \`.p l link\`');
    }

    // Check for group shortcut letter (e.g. .p i link, .p e link)
    let shortcutGroup = null;
    let effectiveArgs = args.trim();
    const shortcutResult = extractGroupShortcut(args);
    if (shortcutResult) {
        shortcutGroup = shortcutResult.shortcut;
        effectiveArgs = shortcutResult.remainingArgs;
    }

    // Extract TMDB title from the URL for professional queue display
    let pLabel = '';
    let displayUrl = '';
    try {
        const fetched = await fetchLinkTitle(effectiveArgs);
        pLabel = fetched.title || '';
        displayUrl = fetched.url || '';
    } catch (_) {}

    if (!pLabel) {
        const parts = effectiveArgs.split('=');
        const tmdbUrl = parts[0]?.trim() || '';
        pLabel = tmdbUrl.length > 60 ? tmdbUrl.substring(0, 57) + '...' : tmdbUrl;
    }

    // Determine target group: shortcut overrides global config
    let currentGroupName = '';
    if (shortcutGroup) {
        currentGroupName = shortcutGroup.name;
    } else {
        try {
            const curSettings = loadSettings();
            if (curSettings.targets && curSettings.targets.length > 0) {
                const grpTarget = curSettings.targets.find(t => t.type === 'group');
                if (grpTarget) currentGroupName = grpTarget.name;
            } else if (curSettings.mode === 'group' && curSettings.groupName) {
                currentGroupName = curSettings.groupName;
            }
        } catch (_) {}
    }

    const task = {
        type: 'p_command',
        description: `🎬 Post: *${pLabel}*`,
        linkUrl: displayUrl.length > 80 ? displayUrl.substring(0, 77) + '...' : displayUrl,
        targetGroupName: currentGroupName || undefined,
        commandText: `.p ${args}`,
        senderJid,
        from,
        executeFn: async (signal, ref) => {
            // If shortcut group specified, temporarily switch settings for this task
            let originalSettings = null;
            if (shortcutGroup) {
                originalSettings = loadSettings();
                const tempSettings = {
                    mode: 'group',
                    groupJid: shortcutGroup.jid,
                    groupName: shortcutGroup.name,
                    privateJid: '',
                    privateName: '',
                    targets: [{ jid: shortcutGroup.jid, name: shortcutGroup.name, type: 'group' }]
                };
                saveSettings(tempSettings);
            }
            try {
                await pCommandHandler(conn, mek, from, senderJid, effectiveArgs, reply, signal, ref);
            } finally {
                // Restore original settings after task completes (if shortcut was used)
                if (originalSettings) {
                    saveSettings(originalSettings);
                }
            }
        }
    };
    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        const groupLabel = currentGroupName ? `\n👥 → *${currentGroupName}*` : '';
        await reply(`🎬 *Task Added to Queue* (Position #${globalTaskQueue.queue.length}):\n📌 *${pLabel}*${displayUrl ? '\n🔗 ' + (displayUrl.length > 80 ? displayUrl.substring(0, 77) + '...' : displayUrl) : ''}${groupLabel}`);
    }
};

// Queue Control Commands
DANIE_COMMANDS['c'] = async (conn, mek, from, senderJid, args, reply) => {
    // ═══════════════════════════════════════════════════════════════
    //  NUCLEAR CANCEL — kills every process, clears every state
    // ═══════════════════════════════════════════════════════════════

    // 1. Clear ALL pending interaction states
    Object.keys(pendingSearch).forEach(k => delete pendingSearch[k]);
    Object.keys(pendingConfig).forEach(k => delete pendingConfig[k]);
    Object.keys(pendingGroupSelection).forEach(k => delete pendingGroupSelection[k]);
    Object.keys(pendingHistory).forEach(k => delete pendingHistory[k]);
    Object.keys(pendingDomainSelection).forEach(k => delete pendingDomainSelection[k]);
    pendingGroupConfirmations.clear();

    // 2. Clear AI Search pending confirmation states
    try {
        const { pendingPreConfirmations, pendingPostSelections, pendingConfirmations } = require('./ai_search');
        if (pendingPreConfirmations) pendingPreConfirmations.clear();
        if (pendingPostSelections) pendingPostSelections.clear();
        if (pendingConfirmations) pendingConfirmations.clear();
    } catch (_) {}

    // 3. Cancel entire queue — abort active task + clear all pending
    const { count, activeAborted } = globalTaskQueue.cancelAll(senderJid);

    // 4. Reset internal progress state
    globalProgressState.active = false;
    globalProgressState.statusMsg = null;
    globalProgressState.totalEstMB = 0;
    globalProgressState.speedMBs = 0;
    globalProgressState.percentage = 0;
    globalProgressState.phaseText = 'Idle';

    // 5. Clear per-group post tracker
    clearGroupPostTracker();

    // 6. Clean temporary files
    try {
        const cmdDir = __dirname;
        const tmpFiles = fs.readdirSync(cmdDir).filter(f => f.startsWith('tmp_') || f.startsWith('extracted_'));
        for (const f of tmpFiles) {
            const fp = path.join(cmdDir, f);
            try {
                const stat = fs.statSync(fp);
                if (stat.isDirectory()) {
                    if (fs.rmSync) fs.rmSync(fp, { recursive: true, force: true });
                    else fs.rmdirSync(fp, { recursive: true });
                } else {
                    fs.unlinkSync(fp);
                }
            } catch (_) {}
        }
    } catch (_) {}

    let msg = `╭─── 🛑 *ALL OPERATIONS CANCELLED* 🛑 ───╮\n\n`;
    if (activeAborted) msg += `⚡ Aborted active running task.\n`;
    if (count > 0) msg += `📋 Cleared *${count}* pending queued task(s).\n`;
    msg += `🤖 Cleared all AI Search & confirmation sessions.\n`;
    msg += `🔀 Cleared all pending config/group/history sessions.\n`;
    msg += `🔄 Reset all progress states.\n`;
    msg += `🧹 Cleaned temporary files.\n\n`;
    msg += `🚀 _Bot is in fresh idle state. Ready for new commands!_`;
    await reply(msg);
};
DANIE_COMMANDS['cancel'] = DANIE_COMMANDS['c'];
DANIE_COMMANDS['clearqueue'] = DANIE_COMMANDS['c'];
DANIE_COMMANDS['cancelall'] = DANIE_COMMANDS['c'];

DANIE_COMMANDS['que'] = async (conn, mek, from, senderJid, args, reply) => {
    await reply(globalTaskQueue.getStatus());
};
DANIE_COMMANDS['queue'] = DANIE_COMMANDS['que'];
DANIE_COMMANDS['qstatus'] = DANIE_COMMANDS['que'];

DANIE_COMMANDS['qdel'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!args || !args.trim()) {
        return reply('❌ Please specify the queue item number to delete (e.g. \`.qdel 1\`).');
    }
    const removed = globalTaskQueue.remove(args.trim());
    if (removed) {
        await reply(`✅ Removed item from queue:\n📌 *${removed.description}*`);
    } else {
        await reply(`❌ Invalid queue position. Use \`.que\` to check active queue items.`);
    }
};
DANIE_COMMANDS['qremove'] = DANIE_COMMANDS['qdel'];

DANIE_COMMANDS['qedit'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!args || !args.trim()) {
        return reply('❌ Usage: \`.qedit <number> <new_command>\`\nExample: \`.qedit 1 .p https://tmdb.org/... = link\`');
    }
    const parts = args.trim().split(/\s+/);
    const indexNum = parts[0];
    const newCmd = parts.slice(1).join(' ');

    if (!newCmd) {
        return reply('❌ Please provide the new command string after the index number.');
    }

    const res = globalTaskQueue.updateCommand(indexNum, newCmd, conn, mek, from, senderJid, reply);
    if (res.error) {
        await reply(`❌ ${res.error}`);
    } else {
        await reply(`✅ Updated queue item #${indexNum}:\n📌 *${res.item.description}*`);
    }
};

DANIE_COMMANDS['allow'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can use this command.');
    let num = (args || '').replace(/[^0-9]/g, '');
    if (!num && mek.message?.extendedTextMessage?.contextInfo?.participant) {
        num = cleanJid(mek.message.extendedTextMessage.contextInfo.participant).split('@')[0];
    }
    if (!num) return reply('❌ Please provide a WhatsApp phone number!\n*Example:* \`.allow 923013068663\` or reply to a message with \`.allow\`');
    const currentSudo = loadSudo();
    if (currentSudo.includes(num)) return reply(`⚠️ Phone number *+${num}* is already allowed!`);
    currentSudo.push(num);
    saveSudo(currentSudo);
    await reply(`✅ Successfully allowed *+${num}* to use DanieWatch Bot commands!`);
};
DANIE_COMMANDS['addowner'] = DANIE_COMMANDS['allow'];
DANIE_COMMANDS['addsudo'] = DANIE_COMMANDS['allow'];

DANIE_COMMANDS['disallow'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can use this command.');
    let num = (args || '').replace(/[^0-9]/g, '');
    if (!num && mek.message?.extendedTextMessage?.contextInfo?.participant) {
        num = cleanJid(mek.message.extendedTextMessage.contextInfo.participant).split('@')[0];
    }
    if (!num) return reply('❌ Please provide a WhatsApp phone number!\n*Example:* \`.disallow 923013068663\` or reply to a message with \`.disallow\`');
    let currentSudo = loadSudo();
    if (!currentSudo.includes(num)) return reply(`⚠️ Phone number *+${num}* is not in the allowed list!`);
    currentSudo = currentSudo.filter(n => n !== num);
    saveSudo(currentSudo);
    await reply(`✅ Successfully removed *+${num}* from allowed users!`);
};
DANIE_COMMANDS['delowner'] = DANIE_COMMANDS['disallow'];
DANIE_COMMANDS['delsudo'] = DANIE_COMMANDS['disallow'];

DANIE_COMMANDS['allowed'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can use this command.');
    const ownerNum = (process.env.NUMBER || process.env.BOT_NUMBER || '').trim().replace(/[^0-9]/g, '');
    const envSudoNums = (process.env.SUDO || '').split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean);
    const dynamicSudo = loadSudo();
    
    let text = `╭─── 🛡️ *ALLOWED USERS LIST* 🛡️ ───╮\n\n`;
    text += `👑 *Primary Owner:* *+${ownerNum || 'N/A'}*\n`;
    if (envSudoNums.length) {
        text += `🛡️ *Config Sudo:* *${envSudoNums.map(n => '+' + n).join(', ')}*\n`;
    }
    if (dynamicSudo.length) {
        text += `\n👤 *Allowed Users (${dynamicSudo.length}):*\n`;
        dynamicSudo.forEach((n, idx) => {
            text += `  ${idx + 1}. *+${n}*\n`;
        });
    } else {
        text += `\n_No extra allowed users added yet. Use \`.allow <number>\` to add._`;
    }
    await reply(text.trim());
};
DANIE_COMMANDS['owners'] = DANIE_COMMANDS['allowed'];
DANIE_COMMANDS['sudolist'] = DANIE_COMMANDS['allowed'];

DANIE_COMMANDS['alive'] = async (conn, mek, from, senderJid, args, reply) => {
    try {
        if (conn && mek && mek.key) {
            await conn.sendMessage(from, { react: { text: '⚡', key: mek.key } });
        }
    } catch(e) {}

    const settings = loadSettings();
    const modeLabel = settings.mode === 'group' ? '👥 Group' : '👤 Private';
    const uptime = formatUptime(process.uptime());
    const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const ramTotal = Math.round(require('os').totalmem() / 1024 / 1024);
    const platform = process.platform === 'linux' ? '🐧 Linux' : (process.platform === 'win32' ? '🪟 Windows' : `💻 ${process.platform}`);

    let targetSummary = 'Self (Private Chat)';
    if (settings.targets && settings.targets.length > 0) {
        targetSummary = settings.targets.map(t => t.name || t.jid).join(', ');
    } else if (settings.mode === 'group' && settings.groupName) {
        targetSummary = settings.groupName;
    }

    const caption =
        `╭─── ⚡ *DANIEWATCH ALIVE* ⚡ ───╮\n\n` +
        `┌─❒ *Bot Status*\n` +
        `│ ⚡ *Status:* Online & Active!\n` +
        `│ 👑 *Developer:* Daniyal Aadil\n` +
        `│ 🤖 *Version:* v1.0.0\n` +
        `│ 📜 *Prefix:* .\n` +
        `│ ⏱️ *Uptime:* ${uptime}\n` +
        `│ 🧠 *Memory:* ${memUsed} MB / ${ramTotal} MB\n` +
        `│ 💻 *Platform:* ${platform}\n` +
        `├─❒ *Active Config*\n` +
        `│ ⚙️ *Mode:* ${modeLabel}\n` +
        `│ 🎯 *Targets:* ${targetSummary}\n` +
        `└───────────────\n\n` +
        `🚀 _Ready for movies, music & video downloads!_`;

    const logoPath = path.join(__dirname, '..', '..', 'assets', 'daniewatch_logo.png');
    if (fs.existsSync(logoPath)) {
        try {
            const imageBuffer = fs.readFileSync(logoPath);
            await conn.sendMessage(from, { image: imageBuffer, caption: caption }, { quoted: mek });
            return;
        } catch (e) {
            console.error('[DanieWatch] Error sending alive logo image:', e.message);
        }
    }
    await reply(caption);
};

DANIE_COMMANDS['qupdate'] = DANIE_COMMANDS['qedit'];

DANIE_COMMANDS['help'] = async (conn, mek, from, senderJid, args, reply) => {
    try {
        if (conn && mek && mek.key) {
            await conn.sendMessage(from, { react: { text: '📖', key: mek.key } });
        }
    } catch(e) {}

    const helpText =
        `╭─── 📖 *DANIEWATCH BOT COMMAND MENU* 📖 ───╮\n` +
        `│\n` +
        `│ 🤖 *Engine:* DanieWatch Automation Core\n` +
        `│ ⚡ *Status:* Online & Operational\n` +
        `│ 💡 *Tip:* Send any direct URL or movie link anytime!\n` +
        `╰───────────────────────────────╯\n\n` +

        `┌─── 🎬 *MOVIES & SERIES FLOW* ───┐\n` +
        `│ • \`.search <query>\` ➔ Smart AI search across all sites\n` +
        `│   _Use:_ \`.search Avengers Endgame\`\n` +
        `│ • \`.sv <query>\` ➔ Search VegaMovies database\n` +
        `│   _Use:_ \`.sv Batman\`\n` +
        `│ • \`.sr <query>\` ➔ Search RogMovies database\n` +
        `│   _Use:_ \`.sr Inception\`\n` +
        `│ • \`.sh <query>\` ➔ Search HDHub4u database\n` +
        `│   _Use:_ \`.sh Interstellar\`\n` +
        `│ • \`.si <query>\` ➔ Search StreamIMDB database\n` +
        `│   _Use:_ \`.si Breaking Bad\`\n` +
        `│ • \`.se <url>\` ➔ Extract & auto-download Nexdrive/VCloud series\n` +
        `│   _Use:_ \`.se https://nexdrive.fit/...\`\n` +
        `│ • \`.p <tmdb> = <url>\` ➔ Download with TMDB poster & metadata\n` +
        `│   _Use:_ \`.p 299536 = https://...\`\n` +
        `│ • \`.d <url>\` ➔ Direct link fast video downloader\n` +
        `│   _Use:_ \`.d https://site.com/video.mp4\`\n` +
        `│ • \`.confirm <num>\` ➔ Select & confirm item from search results\n` +
        `│   _Use:_ \`.confirm 1\`\n` +
        `└───────────────────────────────┘\n\n` +

        `┌─── 🎵 *MUSIC & SOCIAL MEDIA FLOW* ───┐\n` +
        `│ • \`.song <title/url>\` ➔ Download YouTube Music MP3 (Alias: \`.ytm\`)\n` +
        `│   _Use:_ \`.song Shape of You\`\n` +
        `│ • \`.video <title/url>\` ➔ Download YouTube Video MP4 (Alias: \`.yt\`)\n` +
        `│   _Use:_ \`.video https://youtu.be/...\`\n` +
        `│ • \`.ig <url>\` ➔ Download Instagram Reels & Posts (Alias: \`.insta\`)\n` +
        `│   _Use:_ \`.ig https://instagram.com/p/...\`\n` +
        `│ • \`.fb <url>\` ➔ Download Facebook Video (Alias: \`.facebook\`)\n` +
        `│   _Use:_ \`.fb https://fb.watch/...\`\n` +
        `│ • \`.tk <url>\` ➔ Download TikTok Video without watermark (Alias: \`.tiktok\`)\n` +
        `│   _Use:_ \`.tk https://tiktok.com/@...\`\n` +
        `│ • \`.x <url>\` ➔ Download Twitter/X Media Video (Alias: \`.twitter\`)\n` +
        `│   _Use:_ \`.x https://x.com/...\`\n` +
        `└───────────────────────────────┘\n\n` +

        `┌─── 📋 *RELEASE & QUEUE FLOW* ───┐\n` +
        `│ • \`.createlist\` ➔ Create daily release checklist (Alias: \`.daily\`, \`.list\`)\n` +
        `│   _Use:_ \`.createlist\`\n` +
        `│ • \`.7days\` ➔ View 7-day release history & archives (Alias: \`.archive\`)\n` +
        `│   _Use:_ \`.7days\`\n` +
        `│ • \`.listque\` ➔ View pending release queue (Alias: \`.quelist\`)\n` +
        `│   _Use:_ \`.listque\`\n` +
        `│ • \`.status\` ➔ View active download queue status (Alias: \`.que\`, \`.dlstatus\`)\n` +
        `│   _Use:_ \`.status\`\n` +
        `│ • \`.qdel <num>\` ➔ Remove specific item from download queue\n` +
        `│   _Use:_ \`.qdel 2\`\n` +
        `│ • \`.qedit <num> <cmd>\` ➔ Update queued item command\n` +
        `│   _Use:_ \`.qedit 1 .d https://...\`\n` +
        `│ • \`.c\` ➔ Cancel all active downloads & reset queue (Alias: \`.cancel\`)\n` +
        `│   _Use:_ \`.c\`\n` +
        `└───────────────────────────────┘\n\n` +

        `┌─── 👥 *INACTIVE TRACKER FLOW* ───┐\n` +
        `│ • \`.resettracker\` ➔ Init/reset Daniewatch activity tracker (Alias: \`.initinactive\`)\n` +
        `│   _Use:_ \`.resettracker\`\n` +
        `│ • \`.nonactive\` ➔ View list of inactive members (Alias: \`.inactive\`)\n` +
        `│   _Use:_ \`.nonactive\`\n` +
        `│ • \`.listinactive\` ➔ Export TXT file of inactive members with phones\n` +
        `│   _Use:_ \`.listinactive\`\n` +
        `│ • \`.kicknonactive <n>\` ➔ Kick N inactive members with safe delays\n` +
        `│   _Use:_ \`.kicknonactive 5\`\n` +
        `└───────────────────────────────┘\n\n` +

        `┌─── 🛡️ *GROUP SECURITY & PROTECTION* ───┐\n` +
        `│ • \`.antilink\` ➔ Manage Anti-Link protection (add/remove/list/clear)\n` +
        `│   _Use:_ \`.antilink\`\n` +
        `│ • \`.antispam\` ➔ Manage Anti-Spam protection (add/remove/list/clear)\n` +
        `│   _Use:_ \`.antispam\`\n` +
        `└───────────────────────────────┘\n\n` +

        `┌─── ⚙️ *BOT CONFIG & ACCESS CONTROL* ───┐\n` +
        `│ • \`.alive\` ➔ Check bot status, uptime & system specs\n` +
        `│   _Use:_ \`.alive\`\n` +
        `│ • \`.config\` ➔ Configure destination group or DM delivery\n` +
        `│   _Use:_ \`.config\`\n` +
        `│ • \`.setgroup [1-3]\` ➔ Set target destination group number\n` +
        `│   _Use:_ \`.setgroup 1\`\n` +
        `│ • \`.jid\` ➔ Show current chat JID (Alias: \`.groupid\`)\n` +
        `│   _Use:_ \`.jid\`\n` +
        `│ • \`.domain\` ➔ View/configure target domain filters (Alias: \`.domains\`)\n` +
        `│   _Use:_ \`.domain\`\n` +
        `│ • \`.allow <phone>\` ➔ Grant bot command access to a phone number\n` +
        `│   _Use:_ \`.allow +923001234567\`\n` +
        `│ • \`.disallow <phone>\` ➔ Revoke bot command access from a phone number\n` +
        `│   _Use:_ \`.disallow +923001234567\`\n` +
        `│ • \`.allowed\` ➔ List all authorized bot users\n` +
        `│   _Use:_ \`.allowed\`\n` +
        `│ • \`.help\` ➔ Show this command help menu (Alias: \`.menu\`, \`.commands\`)\n` +
        `│   _Use:_ \`.help\`\n` +
        `└───────────────────────────────┘\n\n` +

        `🚀 *DanieWatch Automation Engine*\n` +
        `_Send any direct link or video URL directly to auto-download!_`;

    const logoPath = path.join(__dirname, '..', '..', 'assets', 'daniewatch_logo.png');
    if (fs.existsSync(logoPath)) {
        try {
            const imageBuffer = fs.readFileSync(logoPath);
            await conn.sendMessage(from, { image: imageBuffer, caption: helpText }, { quoted: mek });
            return;
        } catch (e) {
            console.error('[DanieWatch] Error sending help logo image:', e.message);
        }
    }
    await reply(helpText);
};
DANIE_COMMANDS['menu'] = DANIE_COMMANDS['help'];
DANIE_COMMANDS['commands'] = DANIE_COMMANDS['help'];
DANIE_COMMANDS['h'] = DANIE_COMMANDS['help'];
DANIE_COMMANDS['sv'] = async (conn, mek, from, senderJid, args, reply) => {
    await searchCommandHandler(conn, mek, from, senderJid, args, reply, 'vegamovies');
};

DANIE_COMMANDS['sr'] = async (conn, mek, from, senderJid, args, reply) => {
    await searchCommandHandler(conn, mek, from, senderJid, args, reply, 'rogmovies');
};

DANIE_COMMANDS['sh'] = async (conn, mek, from, senderJid, args, reply) => {
    await searchCommandHandler(conn, mek, from, senderJid, args, reply, 'hdhub4u');
};

DANIE_COMMANDS['si'] = async (conn, mek, from, senderJid, args, reply) => {
    await streamImdbSearchHandler(conn, mek, from, senderJid, args, reply);
};

DANIE_COMMANDS['se'] = async (conn, mek, from, senderJid, args, reply) => {
    const nextdriveUrl = (args || '').trim();
    if (!nextdriveUrl || !nextdriveUrl.startsWith('http')) {
        return reply('❌ Please provide a valid Nextdrive / V-Cloud landing page URL!\n\n*Example:* `.se https://nexdrive.fit/genxfm784776495266/`');
    }
    await reply(`⏳ *Extracting episode links from Nextdrive/V-Cloud...*\n⚡ *Concurrency:* 2 links simultaneously | ⏱️ *Timeout:* 20s per link`);
    try {
        const result = await extractSeriesVcloudLinks(nextdriveUrl, {
            concurrency: 2,
            timeoutMs: 20000
        });
        await reply(result.whatsappMessage);
    } catch (err) {
        console.error('[SeriesExtractor] Command failed:', err);
        reply(`❌ Failed to extract series episode links: ${err.message}`);
    }
};
DANIE_COMMANDS['seextract'] = DANIE_COMMANDS['se'];
DANIE_COMMANDS['serieslinks'] = DANIE_COMMANDS['se'];
DANIE_COMMANDS['nexdrive'] = DANIE_COMMANDS['se'];
DANIE_COMMANDS['vcloudlinks'] = DANIE_COMMANDS['se'];

async function fetchImdbId(tmdbId, type = 'movie') {
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    try {
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`;
        const res = await axios.get(url, { timeout: 8000 });
        return res.data?.imdb_id || null;
    } catch (_) {
        return null;
    }
}

async function searchTmdbApi(query) {
    const TMDB_KEY = 'fc6d85b3839330e3458701b975195487';
    const trimmed = query.trim();
    
    // Check if user entered an IMDb ID (e.g. tt4003440)
    if (/^tt\d+/i.test(trimmed)) {
        const findUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(trimmed)}?external_source=imdb_id&api_key=${TMDB_KEY}`;
        try {
            const findRes = await axios.get(findUrl, { timeout: 10000 });
            const movies = (findRes.data?.movie_results || []).map(r => ({ ...r, media_type: 'movie' }));
            const tvs = (findRes.data?.tv_results || []).map(r => ({ ...r, media_type: 'tv' }));
            const combined = [...movies, ...tvs];
            if (combined.length > 0) {
                return combined.slice(0, 8).map(r => ({
                    tmdbId: r.id,
                    type: r.media_type,
                    title: r.title || r.name || 'Unknown',
                    year: (r.release_date || r.first_air_date || '').substring(0, 4),
                    poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                    overview: r.overview || '',
                    href: r.media_type === 'movie'
                        ? `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${r.id}`
                        : `https://embedmaster.link/30ffbr4ijvhbf4ks/tv/${r.id}`,
                    embedMasterUrl: r.media_type === 'movie'
                        ? `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${r.id}`
                        : `https://embedmaster.link/30ffbr4ijvhbf4ks/tv/${r.id}`
                }));
            }
        } catch (e) {
            console.error('[StreamIMDB] TMDB find API failed:', e.message);
        }
    }

    const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${TMDB_KEY}`;
    try {
        const searchRes = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });
        if (searchRes.data && searchRes.data.results) {
            return searchRes.data.results
                .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
                .slice(0, 8)
                .map(r => ({
                    tmdbId: r.id,
                    type: r.media_type,
                    title: r.title || r.name || 'Unknown',
                    year: (r.release_date || r.first_air_date || '').substring(0, 4),
                    poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
                    overview: r.overview || '',
                    href: r.media_type === 'movie'
                        ? `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${r.id}`
                        : `https://embedmaster.link/30ffbr4ijvhbf4ks/tv/${r.id}`,
                    embedMasterUrl: r.media_type === 'movie'
                        ? `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${r.id}`
                        : `https://embedmaster.link/30ffbr4ijvhbf4ks/tv/${r.id}`
                }));
        }
    } catch (e) {
        console.error('[StreamIMDB] TMDB API search failed:', e.message);
    }
    return [];
}

function generateFallbackQueries(query) {
    const stopWords = new Set(['i', 'a', 'an', 'the', 'that', 'this', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with', 'of', 'by', 'my', 'your', 'it', 'is', 'was']);
    const cleaned = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter(Boolean);
    const candidates = [];

    // Candidate 1: Strip stop words if query has > 2 words
    const nonStop = words.filter(w => !stopWords.has(w.toLowerCase()));
    if (nonStop.length > 0 && nonStop.length < words.length) {
        candidates.push(nonStop.join(' '));
    }

    // Candidate 2: Strip season/episode labels like s1, s01, e01, etc.
    const noSeason = query.replace(/\b[sS]\d+([eE]\d+)?\b/g, '').replace(/\bseason\s*\d+\b/gi, '').trim();
    if (noSeason && noSeason !== query && !candidates.includes(noSeason)) {
        candidates.push(noSeason);
    }

    // Candidate 3: Longest 2 key words if query is multi-word
    if (words.length >= 3) {
        const sortedByLength = [...words].sort((a, b) => b.length - a.length);
        const topWords = sortedByLength.slice(0, 2).join(' ');
        if (topWords && !candidates.includes(topWords) && topWords !== query) {
            candidates.push(topWords);
        }
    }

    return candidates;
}

async function streamImdbSearchHandler(conn, mek, from, senderJid, q, reply) {
    try {
        if (!q || !q.trim()) {
            return reply('❌ Please provide a movie or TV show title to search!\n\n*Usage:*\n`.si The House That Jack Built`');
        }

        const query = q.trim();
        await reply(`x Searching IMDb/TMDB & EmbedMaster for *"${query}"*...`);

        initUpsertListener(conn);

        // 1. Search via TMDB Multi-Search API
        let results = await searchTmdbApi(query);
        let fallbackQueryUsed = null;

        // 2. Fallback to StreamIMDB HTML search if TMDB returned no results
        if (results.length === 0) {
            console.log(`[StreamIMDB] TMDB search for "${query}" returned empty, trying StreamIMDB fallback...`);
            const fallbackResults = await searchStreamImdb(query);
            if (fallbackResults && fallbackResults.length > 0) {
                results = fallbackResults.map(r => {
                    const idMatch = r.href.match(/\d+/)?.[0] || '0';
                    return {
                        tmdbId: idMatch,
                        type: r.type || 'movie',
                        title: r.title,
                        year: r.year || '',
                        poster: r.poster || '',
                        overview: '',
                        href: r.href,
                        embedMasterUrl: r.type === 'tv'
                            ? `https://streamimdb.ru/embed/tv/${idMatch}`
                            : `https://streamimdb.ru/embed/movie/${idMatch}`
                    };
                });
            }
        }

        // 3. Smart Fallback Query Reformulation if both returned 0 results
        if (results.length === 0) {
            const fallbackCandidates = generateFallbackQueries(query);
            for (const altQ of fallbackCandidates) {
                if (!altQ || altQ.trim() === query) continue;
                console.log(`[StreamIMDB] Trying smart fallback query: "${altQ}"...`);
                let altResults = await searchTmdbApi(altQ);
                if (altResults.length === 0) {
                    const streamAlt = await searchStreamImdb(altQ);
                    if (streamAlt && streamAlt.length > 0) {
                        altResults = streamAlt.map(r => {
                            const idMatch = r.href.match(/\d+/)?.[0] || '0';
                            return {
                                tmdbId: idMatch,
                                type: r.type || 'movie',
                                title: r.title,
                                year: r.year || '',
                                poster: r.poster || '',
                                overview: '',
                                href: r.href,
                                embedMasterUrl: r.type === 'tv'
                                    ? `https://streamimdb.ru/embed/tv/${idMatch}`
                                    : `https://streamimdb.ru/embed/movie/${idMatch}`
                            };
                        });
                    }
                }
                if (altResults.length > 0) {
                    results = altResults;
                    fallbackQueryUsed = altQ;
                    break;
                }
            }
        }

        if (!results || results.length === 0) {
            return reply(`❌ No IMDb/TMDB search results found for *"${query}"*.\n\n📥 *Tip:* Try searching with main title keywords (e.g. \`.si house\`).`);
        }

        const cleanSender = cleanJid(senderJid);
        pendingSearch[cleanSender] = {
            step: 'streamimdb_select',
            results: results,
            messageId: null
        };

        const optionsList = results.map((r, idx) => {
            const typeLabel = r.type === 'tv' ? '= TV Series' : '< Movie';
            const yearLabel = r.year ? `(${r.year})` : '';
            return {
                id: String(idx + 1),
                title: r.title,
                description: `${typeLabel} ${yearLabel}`.trim()
            };
        });

        let responseText = `< *IMDb / EmbedMaster Results for "${query}":*\n`;
        if (fallbackQueryUsed) {
            responseText += ` _(Showing closest matches for "${fallbackQueryUsed}")_\n`;
        }
        responseText += `\nClick the option menu below to select your title:`;

        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `< IMDb: "${query}"`, responseText, optionsList, mek, null, `© DanieWatch Bot`);
        if (sent && sent.key) {
            pendingSearch[cleanSender].messageId = sent.key.id;
        }
    } catch (err) {
        console.error('[StreamIMDB] Search failed:', err.message);
        reply(`❌ Search failed: ${err.message}`);
    }
}

async function searchCommandHandler(conn, mek, from, senderJid, q, reply, source = 'vegamovies') {
    try {
        const isRog = source === 'rogmovies';
        const isHdhub = source === 'hdhub4u' || source === 'hdhub';
        let siteName = 'Vegamovies';
        let siteDomain = VEGAMOVIES_DOMAIN;
        let cmdHint = '.sv';

        if (isRog) {
            siteName = 'Rogmovies';
            siteDomain = ROGMOVIES_DOMAIN;
            cmdHint = '.sr';
        } else if (isHdhub) {
            siteName = 'HDHub4u';
            siteDomain = HDHUB4U_DOMAIN;
            cmdHint = '.sh';
        }

        if (!q || !q.trim()) {
            return reply(`❌ Please provide a search keyword!\n\n*Usage:*\n\`${cmdHint} Money Heist\``);
        }

        const query = q.trim();
        await reply(`x Searching ${siteName} for *"${query}"*...`);

        initUpsertListener(conn);

        let results = [];
        if (isHdhub) {
            results = await searchHdhub4u(query);
        } else {
            const apiPath = isRog ? '/ts-search.php' : '/search.php';
            const url = `${siteDomain}${apiPath}?q=${encodeURIComponent(query)}&page=1`;
            console.log(`[DanieSearch] Fetching ${siteName} search API: ${url}`);
            
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': siteDomain + '/'
                },
                timeout: 15000
            });

            if (res.data && res.data.hits) {
                results = res.data.hits.map(h => {
                    let permalink = h.document.permalink || '';
                    if (permalink && !permalink.startsWith('http')) {
                        permalink = `${siteDomain}${permalink.startsWith('/') ? '' : '/'}${permalink}`;
                    }
                    let thumbnail = h.document.post_thumbnail || null;
                    if (thumbnail && !thumbnail.startsWith('http')) {
                        thumbnail = `${siteDomain}${thumbnail.startsWith('/') ? '' : '/'}${thumbnail}`;
                    }
                    return {
                        title: h.document.post_title.replace(/&amp;/g, '&'),
                        permalink,
                        thumbnail
                    };
                });
            }
        }

        if (!results || results.length === 0) {
            return reply(`❌ No search results found for *"${query}"* on ${siteName}.`);
        }

        const cleanSender = cleanJid(senderJid);
        pendingSearch[cleanSender] = {
            step: 'select_movie',
            results: results,
            sourceDomain: siteDomain,
            messageId: null
        };

        const optionsList = results.map((r, idx) => ({
            id: String(idx + 1),
            title: r.title,
            description: `Tap to select result #${idx + 1}`
        }));

        let responseText = `x *${siteName} Search Results for "${query}":*\nFound ${results.length} item(s). Click below to select:`;
        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `x ${siteName} Results`, responseText, optionsList, mek, null, `© DanieWatch Bot`);
        if (sent && sent.key) {
            pendingSearch[cleanSender].messageId = sent.key.id;
        }
    } catch(err) {
        console.error('[DanieSearch] Search failed:', err.message);
        reply(`❌ Search failed: ${err.message}`);
    }
}

async function executeFallbackDownload(conn, mek, from, senderJid, state, chosenHosts, reply) {
    const hostsList = Array.isArray(chosenHosts) ? chosenHosts : [chosenHosts];
    if (!hostsList || hostsList.length === 0) {
        return reply(`❌ No download links found for this item. Please try a different search.`);
    }

    // Transition step back so user can make another search choice if desired
    if (state.episodesList && state.episodesList.length > 0) {
        state.step = 'select_episode';
    } else {
        state.step = 'select_resolution';
    }

    const primaryHost = hostsList[0] || {};
    const labelTitle = state.selectedResolution 
        ? `${state.title || 'Media'} (${state.selectedResolution})`
        : (state.title || 'Media');

    const task = {
        type: 'search_download',
        description: `🔍 Search Download: ${labelTitle}`,
        commandText: `Search Download: ${labelTitle}`,
        senderJid,
        from,
        executeFn: async (signal, ref) => {
            let candidates = [];

            // STRICTLY keep ONLY V-Cloud / NexDrive / VGMLink / KatDrive / KMHD / HubDrive hosts (hubcloud completely excluded)
            const vcloudHosts = hostsList.filter(h => {
                const href = (h.href || '').toLowerCase();
                const text = (h.text || '').toLowerCase();
                const isVcloud = href.includes('vcloud') || href.includes('nexdrive') || href.includes('vgmlink') || href.includes('katdrive') || href.includes('kmhd') || href.includes('hubdrive') || text.includes('v-cloud') || text.includes('vcloud');
                const isJunk = href.includes('hubcloud') || href.includes('gpdl') || href.includes('filebee') || href.includes('gofile') || href.includes('vikingfile') || href.includes('megaup') || href.includes('fastdl') || href.includes('telegram') || href.includes('gdtot') || href.includes('drive.google') || isAdLink(h.href, h.text);
                return isVcloud && !isJunk;
            });

            if (vcloudHosts.length === 0) {
                console.log(`[DanieSearch] No V-Cloud download links available for this item.`);
                await reply(`❌ No V-Cloud download links found for this selection.`);
                throw new Error('No V-Cloud download links available for this item.');
            }

            for (const host of vcloudHosts) {
                const href = host.href || '';
                if (!href || isAdLink(href, host.text)) continue;

                if (isLandingUrl(href)) {
                    console.log(`[DanieSearch] Extracting VCloud sub-options from landing host: ${href}`);
                    try {
                        const subOpts = await extractSubOptions(href);
                        if (subOpts && subOpts.length > 0) {
                            subOpts.forEach(opt => {
                                const txt = (opt.text || '').toLowerCase();
                                const optHref = (opt.href || '').toLowerCase();
                                if (!txt.includes('login') && !txt.includes('admin') && !optHref.includes('filebee') && !optHref.includes('gofile') && !optHref.includes('fastdl') && !optHref.includes('gdtot') && !isAdLink(opt.href, opt.text)) {
                                    candidates.push({ name: opt.text || 'VCloud Direct Link', href: opt.href });
                                }
                            });
                        }
                    } catch (subErr) {
                        console.error(`[DanieSearch] VCloud Sub-option extraction failed for ${href}:`, subErr.message);
                    }
                }
                if (!isAdLink(href, host.text)) {
                    candidates.push({ name: host.text || 'VCloud Download Link', href: href });
                }
            }

            // Deduplicate candidates by href & filter out ad links
            const seenHref = new Set();
            candidates = candidates.filter(c => {
                if (!c.href || isAdLink(c.href, c.name) || seenHref.has(c.href)) return false;
                seenHref.add(c.href);
                return true;
            });

            if (candidates.length === 0) {
                console.log(`[DanieSearch] No VCloud download links available for this item.`);
                await reply(`❌ VCloud link resolution returned no candidates.`);
                throw new Error('No VCloud download links available for this item.');
            }

            console.log(`[DanieSearch] VCloud Candidates for download:`, candidates.map(c => `${c.name} -> ${c.href}`));

            let downloadSuccess = false;
            let lastError = null;

            for (let i = 0; i < candidates.length; i++) {
                const cand = candidates[i];
                
                if (cand.name.toLowerCase().includes('10gbps') || cand.name.toLowerCase().includes('10 gbps')) {
                    console.log(`[DanieSearch] Resolving 10Gbps redirect chain for: ${cand.href}`);
                    try {
                        let resolved = await resolveFinalUrl(cand.href);
                        if (resolved && resolved.includes('link=')) {
                            resolved = decodeURIComponent(resolved.split('link=')[1].split('&')[0]);
                        }
                        if (resolved && resolved !== cand.href) {
                            console.log(`[DanieSearch] 10Gbps resolved to: ${resolved}`);
                            cand.href = resolved;
                        }
                    } catch (e) {
                        console.error(`[DanieSearch] 10Gbps resolution failed:`, e.message);
                    }
                }
                
                const downloadQuery = cand.href;
                console.log(`[DanieSearch] VCloud Attempt ${i + 1}: Trying ${cand.name} (${cand.href})...`);
                
                try {
                    await downloadCommandHandler(conn, mek, from, senderJid, downloadQuery, reply, signal, ref, cand.name, true);
                    downloadSuccess = true;
                    console.log(`[DanieSearch] VCloud Attempt ${i + 1} (${cand.name}) succeeded!`);
                    break;
                } catch (err) {
                    if (err.message === 'Aborted') {
                        throw err;
                    }
                    console.error(`[DanieSearch] VCloud Attempt ${i + 1} (${cand.name}) failed:`, err.message);
                    lastError = err;
                }
            }

            if (!downloadSuccess) {
                const errorMsg = lastError ? lastError.message : 'VCloud link resolution failed.';
                await reply(`❌ *VCloud Download Failed:*\n${errorMsg}\n\n_Please try selecting a different quality or option._`);
                throw lastError || new Error('VCloud download failed.');
            } else {
                const isTvShow = state.episodesList && state.episodesList.length > 0;
                if (!isTvShow) {
                    delete pendingSearch[cleanJid(senderJid)];
                }
            }
        }
    };

    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        await reply(`📥 *Added to Queue* (Position #${globalTaskQueue.queue.length}):\n🔍 Download: *${labelTitle}*`);
    }
}

async function handleSearchReply(conn, mek, senderJid, text, reply) {
    const cleanSender = cleanJid(senderJid);
    const state = pendingSearch[cleanSender];
    if (!state) return;

    const from = mek.key.remoteJid;
    const num = parseInt(text.trim(), 10);
    if (state.step === 'song_select') {
        const results = state.results || [];
        if (isNaN(num) || num < 1 || num > results.length) {
            return reply(`❌ Invalid selection. Reply with a number from 1 to ${results.length}.`);
        }
        const selected = results[num - 1];
        delete pendingSearch[cleanSender];
        // Download and send as audio
        if (DANIE_COMMANDS['songdl']) {
            return DANIE_COMMANDS['songdl'](conn, mek, from, senderJid, selected.url, reply);
        }
        return;
    }

    if (state.step === 'yts_select') {
        const results = state.results || [];
        if (isNaN(num) || num < 1 || num > results.length) {
            return reply(`❌ Invalid selection. Reply with a number from 1 to ${results.length}.`);
        }
        const selected = results[num - 1];
        delete pendingSearch[cleanSender];
        // Download and send as video
        if (DANIE_COMMANDS['video']) {
            return DANIE_COMMANDS['video'](conn, mek, from, senderJid, selected.url, reply);
        }
        return;
    }

    if (state.step === 'streamimdb_select') {
        const results = state.results || [];
        if (isNaN(num) || num < 1 || num > results.length) {
            return reply(`❌ Invalid selection. Reply with a number from 1 to ${results.length}.`);
        }

        const selected = results[num - 1];
        const posterUrl = selected.poster || '';
        await reply(`⏳ *Fetching details & poster for:* "${selected.title}"...`);

        try {
            let details = null;
            if (selected.tmdbId && selected.tmdbId !== '0') {
                details = await fetchTmdbById(selected.tmdbId, selected.type || 'movie');
            }
            if (!details) {
                details = await getMediaDetails(selected.href);
            }

            const mediaPoster = details.posterUrl || details.poster || posterUrl;
            const mediaTitle = details.title || selected.title;
            const mediaYear = details.year || selected.year || '';
            const overview = details.overview || selected.overview || '';
            const imdbId = (await fetchImdbId(selected.tmdbId, selected.type || 'movie')) || selected.imdbId || null;
            const imdbDisplay = imdbId ? `< *IMDb ID:* \`${imdbId}\` | *TMDB:* \`${selected.tmdbId}\`` : `< *TMDB ID:* \`${selected.tmdbId}\``;

            if (selected.type === 'tv' || (details.isTv && details.seasons && details.seasons.length > 0)) {
                // TV Series - Show Seasons
                const seasonsList = details.seasons && details.seasons.length > 0
                    ? details.seasons.filter(s => s.season_number > 0 || s.seasonNum > 0)
                    : [{ seasonNum: 1, episodes: [{ epNum: 1, title: 'Episode 1', href: selected.href }] }];

                const optionsList = seasonsList.map((s, idx) => {
                    const sNum = s.season_number || s.seasonNum;
                    const epCount = s.episode_count || (s.episodes ? s.episodes.length : 10);
                    return {
                        id: String(idx + 1),
                        title: `Season ${sNum}`,
                        description: `${epCount} episodes available`
                    };
                });

                let seasonText = `= *${mediaTitle}* ${mediaYear ? `(${mediaYear})` : ''}\n${imdbDisplay}\n_${overview ? overview.substring(0, 150) + '...' : ''}_\n\n*Select a Season:*`;
                const sent = await sendInteractiveOptions(conn, from, mediaTitle, seasonText, optionsList, mek, mediaPoster, `© DanieWatch Bot`);
                pendingSearch[cleanSender] = {
                    step: 'streamimdb_season',
                    title: mediaTitle,
                    year: mediaYear,
                    tmdbId: selected.tmdbId,
                    imdbId,
                    poster: mediaPoster,
                    seasons: seasonsList,
                    messageId: sent && sent.key ? sent.key.id : null
                };
            } else {
                // Movie - Resolve Stream Qualities directly
                const targetEmbedUrl = selected.embedMasterUrl || (imdbId ? `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${imdbId}` : `https://embedmaster.link/30ffbr4ijvhbf4ks/movie/${selected.tmdbId}`);
                console.log(`[StreamIMDB] Resolving stream options for: ${targetEmbedUrl}`);
                const qualities = await resolveStreamOptions(targetEmbedUrl);
                
                const optionsList = qualities.map((q, idx) => ({
                    id: String(idx + 1),
                    title: q.quality,
                    description: `Tap to download stream`
                }));

                let qualityText = `< *${mediaTitle}* ${mediaYear ? `(${mediaYear})` : ''}\n${imdbDisplay}\n_${overview ? overview.substring(0, 150) + '...' : ''}_\n\n*Select Download Quality:*`;
                const sent = await sendInteractiveOptions(conn, from, mediaTitle, qualityText, optionsList, mek, mediaPoster, `© DanieWatch Bot`);
                pendingSearch[cleanSender] = {
                    step: 'streamimdb_quality',
                    title: mediaTitle,
                    year: mediaYear,
                    tmdbId: selected.tmdbId,
                    poster: mediaPoster,
                    qualities,
                    messageId: sent && sent.key ? sent.key.id : null
                };
            }
        } catch (err) {
            console.error('[StreamIMDB] Details fetch error:', err);
            return reply(`❌ Error loading media details: ${err.message}`);
        }
        return;
    }

    if (state.step === 'streamimdb_season') {
        const seasons = state.seasons || [];
        if (isNaN(num) || num < 1 || num > seasons.length) {
            return reply(`❌ Invalid season. Reply with a number from 1 to ${seasons.length}.`);
        }

        const chosenSeason = seasons[num - 1];
        const optionsList = chosenSeason.episodes.map((ep, idx) => ({
            id: String(idx + 1),
            title: `Episode ${ep.epNum}`,
            description: (ep.title || `Episode ${ep.epNum}`).substring(0, 70)
        }));

        let epText = `= *${state.title}* - *Season ${chosenSeason.seasonNum}*\n\n*Select an Episode to Download:*`;
        const sent = await sendInteractiveOptions(conn, from, `${state.title} S${chosenSeason.seasonNum}`, epText, optionsList, mek, state.poster, `© DanieWatch Bot`);
        pendingSearch[cleanSender] = {
            step: 'streamimdb_episode',
            title: state.title,
            poster: state.poster,
            seasonNum: chosenSeason.seasonNum,
            episodes: chosenSeason.episodes,
            messageId: sent && sent.key ? sent.key.id : null
        };
        return;
    }

    if (state.step === 'streamimdb_episode') {
        const episodes = state.episodes || [];
        if (isNaN(num) || num < 1 || num > episodes.length) {
            return reply(`❌ Invalid episode. Reply with a number from 1 to ${episodes.length}.`);
        }

        const chosenEpisode = episodes[num - 1];
        const fullTitle = `${state.title} S${state.seasonNum}E${chosenEpisode.epNum} - ${chosenEpisode.title}`;
        await reply(`⏳ *Fetching stream qualities for:* "${fullTitle}"...`);

        try {
            const embedUrl = await getEpisodeEmbedUrl(chosenEpisode.href);
            if (!embedUrl) {
                return reply(`❌ Could not extract player embed URL for episode: "${fullTitle}".`);
            }
            const qualities = await resolveStreamOptions(embedUrl);
            const optionsList = qualities.map((q, idx) => ({
                id: String(idx + 1),
                title: q.quality,
                description: `Tap to download episode stream`
            }));
            let qualityText = `= *${fullTitle}*\n\n*Select Episode Quality:*`;
            const sent = await sendInteractiveOptions(conn, from, fullTitle, qualityText, optionsList, mek, state.poster, `© DanieWatch Bot`);
            pendingSearch[cleanSender] = {
                step: 'streamimdb_quality',
                title: fullTitle,
                poster: state.poster,
                qualities,
                messageId: sent && sent.key ? sent.key.id : null
            };
        } catch (err) {
            console.error('[StreamIMDB] Episode embed error:', err);
            return reply(`❌ Error resolving episode stream: ${err.message}`);
        }
        return;
    }

    if (state.step === 'streamimdb_quality') {
        const qualities = state.qualities || [];
        if (isNaN(num) || num < 1 || num > qualities.length) {
            return reply(`❌ Invalid quality selection. Reply with a number from 1 to ${qualities.length}.`);
        }

        const chosenQuality = qualities[num - 1];
        const title = state.title;
        const formattedFileName = buildFormattedDanieFileName(title, state.year || '', state.seasonNum || null, state.epNum || null, chosenQuality.quality, 'mp4');
        
        delete pendingSearch[cleanSender];

        let statusMsg = await reply(` *Starting Download:* "${formattedFileName}"\n📥 Initializing EmbedMaster stream engine...`);
        globalProgressState.statusMsg = statusMsg && statusMsg.key ? { key: statusMsg.key, from } : null;
        globalProgressState.active = true;
        globalProgressState.fileName = formattedFileName;
        globalProgressState.quality = chosenQuality.quality;
        globalProgressState.percentage = 0;
        globalProgressState.phaseText = 'Initializing stream engine';

        const settings = loadSettings();
        const { activeTargets } = getActiveTargetsAndPrimary(settings, senderJid);

        const task = {
            id: `si_${Date.now()}`,
            description: `EmbedMaster: ${formattedFileName}`,
            executeFn: async (signal, ref) => {
                const tempDir = path.join(__dirname, '..', '..', 'scratch');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${formattedFileName.replace(/[^a-zA-Z0-9._\-]/g, '_')}`);
                if (ref) ref.filePath = tempFilePath;

                try {
                    let lastUpdate = 0;
                    await downloadStreamWithFFmpeg(chosenQuality.streamUrl, tempFilePath, 'https://nextgencloudfabric.com/', 6, async (info) => {
                        globalProgressState.active = true;
                        globalProgressState.fileName = formattedFileName;
                        globalProgressState.quality = chosenQuality.quality;
                        globalProgressState.downloadedMB = info.downloadedMB;
                        globalProgressState.totalEstMB = info.totalEstMB;
                        globalProgressState.speedMBs = info.speedMBs;
                        globalProgressState.percentage = info.percentage;
                        globalProgressState.phaseText = `Downloading (${info.percentage}%)`;

                        const now = Date.now();
                        if (now - lastUpdate > 3000 || info.percentage === 100) {
                            lastUpdate = now;
                            const updateText = ` *EmbedMaster Download Progress:*\n< *File:* "${formattedFileName}"\n= *Quality:* ${chosenQuality.quality}\n= *Downloaded:* ${info.downloadedMB} MB / ~${info.totalEstMB} MB (${info.percentage}%)\n= *Speed:* ${info.speedMBs} MB/s`;
                            if (globalProgressState.statusMsg && globalProgressState.statusMsg.key) {
                                try {
                                    await conn.sendMessage(globalProgressState.statusMsg.from || from, { text: updateText, edit: globalProgressState.statusMsg.key });
                                } catch (_) {}
                            }
                        }
                    });

                    const verification = await verifyMediaFile(tempFilePath);
                    if (!verification.valid) {
                        throw new Error(`Media verification failed. File size: ${verification.sizeMB.toFixed(2)}MB, duration: ${verification.duration}s`);
                    }

                    console.log(`[StreamIMDB] Media verified valid: ${verification.sizeMB.toFixed(2)}MB, ${verification.duration.toFixed(1)}s`);
                    globalProgressState.phaseText = `Uploading (${verification.sizeMB.toFixed(2)} MB)`;
                    
                    const durationMins = (verification.duration / 60).toFixed(1);
                    let durationText = `⏱ *Duration:* ${durationMins} mins`;
                    if (verification.duration < 1800 && !state.seasonNum) {
                        durationText += `\n *Notice:* EmbedMaster CDN provider provided a sample/short clip (${durationMins}m). For full 2hr movie files, use \`.d ${title}\`!`;
                    }

                    try {
                        const uploadText = `= *Uploading to WhatsApp:* "${formattedFileName}"\n= *File Size:* ${verification.sizeMB.toFixed(2)} MB\n${durationText}\n⏳ Sending video document to chat...`;
                        if (globalProgressState.statusMsg && globalProgressState.statusMsg.key) {
                            await conn.sendMessage(globalProgressState.statusMsg.from || from, { text: uploadText, edit: globalProgressState.statusMsg.key });
                        }
                    } catch (_) {}

                    const filePayload = {
                        document: { url: tempFilePath },
                        mimetype: 'video/mp4',
                        fileName: formattedFileName,
                        caption: `🎬 *${formattedFileName.replace(/\.mp4$/i, '')}*\n📥 *Quality:* ${chosenQuality.quality}\n📥 *Size:* ${verification.sizeMB.toFixed(2)}MB\n${durationText}\n\nDownloaded via DanieBot (.si)`
                    };

                    await sendAndForwardFile(conn, activeTargets, filePayload, { from: mek.key.remoteJid, senderJid: cleanJid(senderJid) });

                    try {
                        const completeText = ` *Upload Completed:* "${formattedFileName}" (${verification.sizeMB.toFixed(2)} MB)\n${durationText}`;
                        if (statusMsg && statusMsg.key) {
                            await conn.sendMessage(from, { text: completeText, edit: statusMsg.key });
                        }
                    } catch (_) {}
                } catch (dlErr) {
                    console.error('[StreamIMDB] Download/upload error:', dlErr);
                    try {
                        if (statusMsg && statusMsg.key) {
                            await conn.sendMessage(from, { text: `R StreamIMDB download/upload failed for "${formattedFileName}": ${dlErr.message}`, edit: statusMsg.key });
                        } else {
                            await reply(`❌ StreamIMDB download/upload failed for "${formattedFileName}": ${dlErr.message}`);
                        }
                    } catch (_) {}
                } finally {
                    if (fs.existsSync(tempFilePath)) {
                        try { fs.unlinkSync(tempFilePath); } catch (_) {}
                    }
                }
            }
        };

        const queuedTask = globalTaskQueue.add(task);
        if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
            await reply(`📥 *Position in Queue (#${globalTaskQueue.queue.length}):* "${formattedFileName}"`);
        }
        return;
    }

    if (state.step === 'select_movie') {
        const movies = state.results || [];
        if (isNaN(num) || num < 1 || num > movies.length) {
            return reply(`❌ Invalid movie number. Reply with a number from 1 to ${movies.length}.`);
        }

        const selectedMovie = movies[num - 1];

        try {
            const sourceDomain = state.sourceDomain || VEGAMOVIES_DOMAIN;
            const postUrl = selectedMovie.permalink.startsWith('http') 
                ? selectedMovie.permalink 
                : `${sourceDomain}${selectedMovie.permalink}`;

            console.log(`[DanieSearch] Scraping post page: ${postUrl}`);
            const allLinks = await scrapeAllPostLinks(postUrl);

            // Keep all valid download links (including ZIP/RAR batch links, episode links, resolutions)
            const validLinks = allLinks.filter(l => {
                if (!l || !l.href || !l.href.startsWith('http')) return false;
                const lowerHref = l.href.toLowerCase();
                if (lowerHref.includes('telegram') || lowerHref.includes('facebook') || lowerHref.includes('twitter') || lowerHref.includes('youtube.com') || lowerHref.includes('/admin')) return false;
                return true;
            });

            if (validLinks.length === 0) {
                delete pendingSearch[cleanSender];
                return reply(`❌ No valid download links could be parsed from this post.`);
            }

            // Deduplicate links by href
            const seenHref = new Set();
            const displayLinks = validLinks.filter(l => {
                if (seenHref.has(l.href)) return false;
                seenHref.add(l.href);
                return true;
            });

            // Update state
            pendingSearch[cleanSender] = {
                step: 'select_resolution',
                title: selectedMovie.title,
                permalink: selectedMovie.permalink,
                thumbnail: selectedMovie.thumbnail,
                sourceDomain: state.sourceDomain,
                links: displayLinks,
                activeDownload: null,
                messageId: null
            };

            const optionsList = displayLinks.map((l, i) => {
                const cleanText = l.text.replace(/\s*/g, '').replace(/\[?DanieWatch\]?/gi, '').trim();
                const isZipOrPack = l.isPack || /\bzip\b|\brar\b|\bpack\b|\bbatch\b/i.test(cleanText) || /\bzip\b|\brar\b|\bpack\b|\bbatch\b/i.test(l.href);
                
                let titleLabel = '';
                if (isZipOrPack) {
                    titleLabel = `= ${l.resolution && l.resolution !== 'Unknown' ? l.resolution : 'Zip / Batch'}`;
                } else if (l.resolution && l.resolution !== 'Unknown') {
                    titleLabel = `< ${l.resolution} Quality`;
                } else {
                    titleLabel = (cleanText || `Option ${i + 1}`).substring(0, 24);
                }

                const descText = (l.heading ? `${l.heading}  ${cleanText}` : cleanText).substring(0, 70);

                return {
                    id: String(i + 1),
                    title: titleLabel.substring(0, 24),
                    description: descText || `Tap to select option #${i + 1}`
                };
            });

            let bodyText = `< *${selectedMovie.title}*\n\nSelect a download quality / link option:`;
            const sent = await sendInteractiveOptions(conn, from, selectedMovie.title, bodyText, optionsList, mek, selectedMovie.thumbnail, `© DanieWatch Bot`);
            if (sent && sent.key) {
                pendingSearch[cleanSender].messageId = sent.key.id;
            }
        } catch (err) {
            console.error('[DanieSearch] Failed to load movie post details:', err.message);
            delete pendingSearch[cleanSender];
            reply(`❌ Failed to load movie details: ${err.message}`);
        }
    } else if (state.step === 'select_resolution') {
        const links = state.links || [];
        if (isNaN(num) || num < 1 || num > links.length) {
            return reply(`❌ Invalid resolution number. Reply with a number from 1 to ${links.length}.`);
        }

        // If there's an active download running, abort it before proceeding with the new choice
        if (state.activeDownload) {
            try {
                console.log('[DanieSearch] Aborting active download to switch to new resolution selection.');
                state.activeDownload.controller.abort();
                if (state.activeDownload.ref && state.activeDownload.ref.filePath) {
                    const fp = state.activeDownload.ref.filePath;
                    if (fs.existsSync(fp)) {
                        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (_) {}
                        console.log(`[DanieSearch] Deleted old temp file: ${fp}`);
                    }
                }
            } catch (abortErr) {
                console.error('[DanieSearch] Failed to abort active download:', abortErr.message);
            }
            state.activeDownload = null;
        }

        const selectedLink = links[num - 1];

        try {
            // Group hosts by episode to check if this is a series
            const episodesMap = new Map();

            // First check if state.links contains episode labels directly
            const resMatchingLinks = (state.links || []).filter(l => l.resolution === selectedLink.resolution || selectedLink.resolution === 'Unknown');
            resMatchingLinks.forEach(l => {
                if (l.episode) {
                    if (!episodesMap.has(l.episode)) {
                        episodesMap.set(l.episode, []);
                    }
                    const lowerText = l.text.toLowerCase();
                    const lowerHref = l.href.toLowerCase();
                    if (lowerText.includes('drive') || lowerHref.includes('hubdrive')) {
                        episodesMap.get(l.episode).unshift({ text: l.text, href: l.href, episode: l.episode });
                    } else {
                        episodesMap.get(l.episode).push({ text: l.text, href: l.href, episode: l.episode });
                    }
                }
            });

            let directHosts = [];
            if (episodesMap.size === 0) {
                console.log(`[DanieSearch] Resolving direct host links for redirect url: ${selectedLink.href}`);
                directHosts = await extractDirectDownloadLinks(selectedLink.href);

                if (!directHosts || directHosts.length === 0) {
                    return reply(`❌ No direct download links could be resolved for this resolution.`);
                }

                directHosts.forEach(h => {
                    const epLabel = h.episode;
                    if (epLabel) {
                        if (!episodesMap.has(epLabel)) {
                            episodesMap.set(epLabel, []);
                        }
                        episodesMap.get(epLabel).push(h);
                    }
                });
            }

            // Check if this post or resolution link represents a TV series/show
            const isTvShow = /season\s*\d+|series|episode/i.test(state.title || '') || 
                             (state.type === 'tv') || 
                             /season\s*\d+|series|episode/i.test(selectedLink.heading || '') || 
                             /season\s*\d+|series|episode/i.test(selectedLink.text || '');

            if (isTvShow && episodesMap.size > 0) {
                // TV Show episode selection!
                state.step = 'select_episode';
                state.resolutionHeading = selectedLink.heading || selectedLink.text;
                state.selectedResolution = selectedLink.resolution;
                state.episodesList = Array.from(episodesMap.keys()).sort((a, b) => {
                    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
                });
                state.episodesMap = Object.fromEntries(episodesMap);
                state.messageId = null;

                const optionsList = state.episodesList.map((ep, idx) => ({
                    id: String(idx + 1),
                    title: ep,
                    description: `Tap to download ${ep}`
                }));
                optionsList.push({
                    id: String(state.episodesList.length + 1),
                    title: `= Download All Episodes`,
                    description: `Download all ${state.episodesList.length} episodes`
                });

                let episodeListText = `xR *${selectedLink.heading || selectedLink.text}*\n\nSelect episode(s) to download:`;
                const sent = await sendInteractiveOptions(conn, from, `TV Series Episodes`, episodeListText, optionsList, mek, null, `© DanieWatch Bot`);
                if (sent && sent.key) {
                    state.messageId = sent.key.id;
                }
            } else {
                // Movie or single file! Directly execute fallback download on all direct hosts
                state.selectedResolution = selectedLink.resolution;
                await executeFallbackDownload(conn, mek, from, senderJid, state, directHosts, reply);
            }
        } catch (err) {
            console.error('[DanieSearch] Failed to resolve hosts:', err.message);
            reply(`❌ Failed to resolve download hosts: ${err.message}`);
        }
    } else if (state.step === 'select_episode') {
        const epList = state.episodesList || [];
        const downloadAllOption = epList.length + 1;
        const rawText = text.trim().toLowerCase();

        let selectedIndices = [];

        if (rawText === 'all' || rawText === String(downloadAllOption)) {
            selectedIndices = epList.map((_, i) => i);
        } else {
            const parts = rawText.split(/[\s,]+/);
            for (const part of parts) {
                if (part.includes('-')) {
                    const rangeParts = part.split('-').map(s => s.trim());
                    const startNum = parseInt(rangeParts[0], 10);
                    const endNum = parseInt(rangeParts[1], 10);
                    if (!isNaN(startNum) && !isNaN(endNum) && startNum >= 1 && endNum <= epList.length && startNum <= endNum) {
                        for (let i = startNum; i <= endNum; i++) {
                            if (!selectedIndices.includes(i - 1)) selectedIndices.push(i - 1);
                        }
                    }
                } else {
                    const num = parseInt(part, 10);
                    if (!isNaN(num) && num >= 1 && num <= epList.length) {
                        if (!selectedIndices.includes(num - 1)) selectedIndices.push(num - 1);
                    }
                }
            }
        }

        if (selectedIndices.length === 0) {
            return reply(`❌ Invalid episode selection. Reply with episode number(s) (e.g. \`1\`, \`1, 3, 5\`, \`1-5\`), or \`${downloadAllOption}\` for All Episodes.`);
        }

        await reply(`📥 *Adding ${selectedIndices.length} episode(s) to download queue...*`);

        for (const idx of selectedIndices) {
            const epLabel = epList[idx];
            const episodeHosts = (state.episodesMap || {})[epLabel] || [];
            if (episodeHosts.length > 0) {
                await executeFallbackDownload(conn, mek, from, senderJid, state, episodeHosts, reply);
            } else {
                await reply(` Skipping *${epLabel}*  no download hosts found.`);
            }
        }
    }
}

cmd({
    pattern: 'domain',
    alias: ['domains'],
    react: '🌐',
    desc: 'Displays and allows interactive update of Rogmovies and Vegamovies search domains stored permanently in bot files.',
    category: 'download',
    use: '.domain [1|2] [new_url]',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    if (typeof DANIE_COMMANDS['domain'] === 'function') {
        await DANIE_COMMANDS['domain'](conn, mek, from, senderJid, q, reply);
    }
});

cmd({
    pattern: 'sv',
    react: 'x',
    desc: 'Searches for movies/series on Vegamovies and allows interactive resolution selection and download.',
    category: 'download',
    use: '.sv <keyword>',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await searchCommandHandler(conn, mek, from, senderJid, q, reply, 'vegamovies');
});

cmd({
    pattern: 'sr',
    react: 'x',
    desc: 'Searches for movies/series on Rogmovies and allows interactive resolution selection and download.',
    category: 'download',
    use: '.sr <keyword>',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await searchCommandHandler(conn, mek, from, senderJid, q, reply, 'rogmovies');
});

cmd({
    pattern: 'se',
    alias: ['serieslinks', 'nexdrive', 'vcloudlinks'],
    react: '=',
    desc: 'Extracts all episode direct download links (10Gbps > FSLv2 > FSL) from a Nextdrive series page and returns a WhatsApp copyable message.',
    category: 'download',
    use: '.se <nextdrive_url>',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };

    if (!q || !q.trim()) {
        return reply('❌ Please provide a Nextdrive landing page URL!\n\n*Example:* `.se https://nexdrive.fit/genxfm784776495266/`');
    }

    const nextdriveUrl = q.trim();
    if (!nextdriveUrl.startsWith('http')) {
        return reply('❌ Invalid URL! Please provide a valid HTTP/HTTPS Nextdrive URL.');
    }

    await reply(`⏳ *Extracting episode links from Nextdrive...*\n *Concurrency:* 2 links simultaneously | ⏱️ *Timeout:* 20s per link`);

    try {
        const result = await extractSeriesVcloudLinks(nextdriveUrl, {
            concurrency: 2,
            timeoutMs: 20000
        });

        await reply(result.whatsappMessage);
    } catch (err) {
        console.error('[SeriesExtractor] Command failed:', err);
        reply(`❌ Failed to extract series episode links: ${err.message}`);
    }
});

cmd({
    pattern: 'si',
    react: '<',
    desc: 'Searches StreamIMDB.ru for movies & TV series to stream and download directly.',
    category: 'download',
    use: '.si <keyword>',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    const cleanSender = cleanJid(senderJid);

    if (!q || !q.trim()) {
        return reply('❌ Please provide a movie or TV show name to search!\n\n*Example:* `.si Interstellar`');
    }

    const query = q.trim();
    await reply(`x *Searching StreamIMDB for:* "${query}"...`);

    try {
        const results = await searchStreamImdb(query);
        if (!results || results.length === 0) {
            return reply(`❌ No results found on StreamIMDB for "${query}".`);
        }

        let listText = `🎬 *StreamIMDB Search Results for:* _"${query}"_\n\n`;
        results.forEach((item, idx) => {
            const badge = item.type === 'tv' ? '= TV Series' : '< Movie';
            listText += `  \`${idx + 1}\`  *${item.title}* (${item.year}) [${badge}]\n`;
        });
        listText += `\n_Reply with a number (1-${results.length}) to select._`;

        const sent = await reply(listText);
        pendingSearch[cleanSender] = {
            step: 'streamimdb_select',
            results,
            messageId: sent && sent.key ? sent.key.id : null
        };
    } catch (err) {
        console.error('[StreamIMDB] Search error:', err);
        return reply(`❌ Failed to search StreamIMDB: ${err.message}`);
    }
});

function isTaskRunning() {
    return globalTaskQueue.isProcessing || globalTaskQueue.queue.length > 0;
}

// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
//  YOUTUBE COMMANDS (migrated from youtube.js)
// """""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
// execSync already imported at top of file (line 270)
const yts = require('yt-search');

const ytDefaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

async function convertYtMedia(ytUrl, audioBitrate, videoQuality, format) {
    const tempRawPath = path.join(os.tmpdir(), `yt_raw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${format || 'mp4'}`);
    const tempFixedPath = path.join(os.tmpdir(), `yt_fixed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${format || 'mp4'}`);
    try {
        const directUrl = await downloadYoutubeVideoUrl(ytUrl, videoQuality || '720', format || 'mp4');
        if (!directUrl) throw new Error("Direct URL resolution failed");

        const fetch = require('node-fetch');
        const fileRes = await fetch(directUrl, { headers: ytDefaultHeaders });
        if (!fileRes.ok) throw new Error(`File download failed with status ${fileRes.status}`);

        const fileStream = fs.createWriteStream(tempRawPath);
        await new Promise((resolve, reject) => { fileRes.body.pipe(fileStream); fileRes.body.on('error', reject); fileStream.on('finish', resolve); });
        let mime = format === 'mp4' ? "video/mp4" : "audio/mpeg";

        if (format === 'mp4') {
            try {
                execSync(`ffmpeg -y -i "${tempRawPath}" -c copy -movflags +faststart "${tempFixedPath}"`, { stdio: 'ignore' });
                if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                    try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                    return { filePath: tempFixedPath, filename: `yt_video.${format}`, mimetype: mime };
                }
            } catch (e) {
                try {
                    execSync(`ffmpeg -y -i "${tempRawPath}" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${tempFixedPath}"`, { stdio: 'ignore' });
                    if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                        return { filePath: tempFixedPath, filename: `yt_video.${format}`, mimetype: mime };
                    }
                } catch (_) {}
            }
        }
        return { filePath: tempRawPath, filename: `yt_media.${format}`, mimetype: mime };
    } catch (err) {
        console.error("[YouTube Error]:", err.message);
        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
        try { if (fs.existsSync(tempFixedPath)) fs.unlinkSync(tempFixedPath); } catch (_) {}
        return null;
    }
}

async function downloadYoutubeMedia(inputUrlOrQuery, isAudio = false) {
    let targetUrl = inputUrlOrQuery;
    let videoInfo = null;

    if (targetUrl.includes('music.youtube.com')) {
        targetUrl = targetUrl.replace('music.youtube.com', 'www.youtube.com');
    }

    if (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be')) {
        console.log(`[YouTubeHelper] Searching YouTube for query: "${targetUrl}"`);
        const searchRes = await yts(targetUrl);
        if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
            videoInfo = searchRes.videos[0];
            targetUrl = videoInfo.url;
            console.log(`[YouTubeHelper] Found video: "${videoInfo.title}" (${videoInfo.url})`);
        } else {
            throw new Error("No YouTube video found for query.");
        }
    } else {
        try {
            const searchRes = await yts(targetUrl);
            if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
                videoInfo = searchRes.videos[0];
            }
        } catch (_) {}
    }

    const title = videoInfo ? videoInfo.title : 'YouTube Media';
    const timestamp = videoInfo ? videoInfo.timestamp : '';
    const views = videoInfo ? videoInfo.views : '';
    const thumbnail = videoInfo ? videoInfo.thumbnail : '';

    const format = isAudio ? 'mp3' : 'mp4';
    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFile = path.join(os.tmpdir(), `yt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);

    // Strategy 1 (Primary): Use cnv.cx direct stream resolver (SAME METHOD AS .p TRAILER DOWNLOAD)
    try {
        console.log(`[YouTubeHelper] Primary Engine: Resolving YouTube media using cnv.cx API...`);
        const directVideoUrl = await downloadYoutubeVideoUrl(targetUrl, '720', format);
        if (directVideoUrl) {
            console.log(`[YouTubeHelper] Direct media URL resolved: ${directVideoUrl}. Downloading stream...`);
            const fetch = require('node-fetch');
            const mediaRes = await fetch(directVideoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                    'Referer': 'https://frame.y2meta-uk.com/',
                    'Origin': 'https://frame.y2meta-uk.com',
                    'Accept': '*/*'
                }
            });

            if (mediaRes.ok) {
                const tempRawPath = path.join(os.tmpdir(), `yt_raw_${Date.now()}.${ext}`);
                const fileWriter = fs.createWriteStream(tempRawPath);
                await new Promise((resolve, reject) => {
                    mediaRes.body.pipe(fileWriter);
                    mediaRes.body.on('error', reject);
                    fileWriter.on('finish', resolve);
                });

                if (fs.existsSync(tempRawPath) && fs.statSync(tempRawPath).size > 1000) {
                    if (!isAudio) {
                        console.log(`[YouTubeHelper] Applying faststart MP4 remux for video...`);
                        await remuxFileToFaststart(tempRawPath);
                        return {
                            filePath: tempRawPath,
                            title,
                            timestamp,
                            views,
                            thumbnail,
                            targetUrl,
                            mimetype: 'video/mp4'
                        };
                    } else {
                        try {
                            execSync(`ffmpeg -y -i "${tempRawPath}" -vn -c:a libmp3lame -b:a 128k "${tempFile}"`, { stdio: 'ignore' });
                            if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
                                try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                                return {
                                    filePath: tempFile,
                                    title,
                                    timestamp,
                                    views,
                                    thumbnail,
                                    targetUrl,
                                    mimetype: 'audio/mpeg'
                                };
                            }
                        } catch (_) {}

                        return {
                            filePath: tempRawPath,
                            title,
                            timestamp,
                            views,
                            thumbnail,
                            targetUrl,
                            mimetype: 'audio/mpeg'
                        };
                    }
                }
            }
        }
    } catch (cnvErr) {
        console.warn(`[YouTubeHelper] Primary cnv.cx API strategy failed: ${cnvErr.message}`);
    }

    // Strategy 2 (Fallback): Try system / local yt-dlp binaries
    const ytdlpLocalBin = path.join(__dirname, '..', '..', 'yt-dlp.exe');
    const ytdlpCandidates = [
        'yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/home/runner/.local/bin/yt-dlp',
    ];
    if (fs.existsSync(ytdlpLocalBin)) {
        ytdlpCandidates.push(`"${ytdlpLocalBin}"`);
    }

    const formatFlag = isAudio ? '-f "140/251/ba/b"' : '-f "18/b/bv*+ba"';
    const commonFlags = '--js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30';

    for (const bin of ytdlpCandidates) {
        try {
            console.log(`[YouTubeHelper] Fallback: Trying ${bin} for "${title}"...`);
            const strategies = [
                '--extractor-args "youtube:player_client=android"',
                '--extractor-args "youtube:player_client=web"',
                '',
            ];

            for (const strategy of strategies) {
                try {
                    const cmd = `${bin} ${commonFlags} ${strategy} ${formatFlag} -o "${tempFile}" "${targetUrl}"`;
                    await execPromise(cmd, { timeout: 120000 });

                    if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
                        return {
                            filePath: tempFile,
                            title,
                            timestamp,
                            views,
                            thumbnail,
                            targetUrl,
                            mimetype: isAudio ? "audio/mp4" : "video/mp4"
                        };
                    }
                } catch (_) {
                    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
                }
            }
        } catch (_) {}
    }

    throw new Error("Failed to download YouTube media. All engines failed.");
}

function extractYtId(urlStr) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|playlist\?list=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = urlStr.match(regex);
    return match ? match[1] : null;
}

function normalizeYtUrl(urlStr) {
    const id = extractYtId(urlStr);
    return id ? `https://www.youtube.com/watch?v=${id}` : urlStr;
}

// .song  search YouTube and list results
DANIE_COMMANDS['song'] = async (conn, mek, from, senderJid, args, reply) => {
    try {
        if (!args) return reply("🎬 Please provide a search query.\nExample: `.song Shape of You`");
        const searchRes = await yts(args);
        const videos = searchRes.videos.slice(0, 10);
        if (!videos.length) return reply("❌ No songs found.");
        
        const optionsList = videos.map((item, idx) => ({
            id: String(idx + 1),
            title: item.title,
            description: `${item.timestamp} | ${item.views} views`
        }));
        let listText = `🎬 *Song Search Results for:* _"${args}"_\n\nClick below to select:`;
        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `< Song Search: "${args}"`, listText, optionsList, mek, null, `© DanieWatch Bot`);
        pendingSearch[cleanJid(senderJid)] = { step: 'song_select', results: videos, messageId: sent && sent.key ? sent.key.id : null };
    } catch (err) { reply(`❌ Error: ${err.message}`); }
};

// .songdl  download audio from YouTube URL
DANIE_COMMANDS['songdl'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("Please provide a YouTube URL.");
        const cleanUrl = normalizeYtUrl(args);
        const searchRes = await yts(cleanUrl);
        const info = searchRes.videos[0];
        if (!info) return reply("❌ No video found.");
        await reply(`⏳ *Downloading:* "${info.title}"...`);
        dl = await convertYtMedia(info.url, "128", "480", "mp3");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Audio download failed.");
        await conn.sendMessage(from, { audio: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: `${info.title}.mp3`, ptt: false }, { quoted: mek });
        await reply(` *${info.title}*  ${info.timestamp}`);
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};

// .yt1s  download audio with format choice (1=audio, 2=doc, 3=voice)
DANIE_COMMANDS['yt1s'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("Please provide a query.");
        const [query, choice] = args.split(" & ");
        if (!query || !choice) return reply("Invalid format. Use: `.yt1s <URL> & <1|2|3>`");
        const searchRes = await yts(query);
        const info = searchRes.videos[0];
        if (!info) return reply("No video found.");
        dl = await convertYtMedia(info.url, "128", "480", "mp3");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Audio download failed.");
        if (choice.trim() === '1') {
            await conn.sendMessage(from, { audio: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: `${info.title}.mp3`, ptt: false });
        } else if (choice.trim() === '2') {
            await conn.sendMessage(from, { document: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: `${info.title}.mp3` });
        } else if (choice.trim() === '3') {
            await conn.sendMessage(from, { audio: { url: dl.filePath }, mimetype: "audio/mp4", ptt: true });
        }
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};

// .yts  search YouTube videos
DANIE_COMMANDS['yts'] = async (conn, mek, from, senderJid, args, reply) => {
    try {
        if (!args) return reply("🎬 Please provide a search query.");
        const searchRes = await yts(args);
        const videos = searchRes.videos.slice(0, 10);
        if (!videos.length) return reply("❌ No videos found.");
        
        const optionsList = videos.map((item, idx) => ({
            id: String(idx + 1),
            title: item.title,
            description: `${item.timestamp} | ${item.views} views`
        }));
        let listText = `🎬 *Video Search Results for:* _"${args}"_\n\nClick below to select:`;
        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `< Video Search: "${args}"`, listText, optionsList, mek, null, `© DanieWatch Bot`);
        pendingSearch[cleanJid(senderJid)] = { step: 'yts_select', results: videos, messageId: sent && sent.key ? sent.key.id : null };
    } catch (err) { reply(`❌ Error: ${err.message}`); }
};
DANIE_COMMANDS['yts1'] = DANIE_COMMANDS['yts'];

// .video / .ytv / .yt  download YouTube video directly
DANIE_COMMANDS['video'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("🎬 Please provide a YouTube URL or title.\nExample: `.video Shape of You`");
        const cleanUrl = normalizeYtUrl(args);
        const searchRes = await yts(cleanUrl);
        const info = (searchRes && searchRes.videos && searchRes.videos.length > 0) ? searchRes.videos[0] : null;
        if (!info) return reply("❌ No YouTube video found.");
        await reply(`⏳ *Downloading:* "${info.title}"...`);
        dl = await convertYtMedia(info.url, "128", "720", "mp4");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Video download failed.");
        const caption = `< *${info.title}*\n⏱ ${info.timestamp} | =M ${info.views}\n= ${info.url}`;
        await conn.sendMessage(from, { video: { url: dl.filePath }, mimetype: "video/mp4", caption, fileName: `${info.title}.mp4` }, { quoted: mek });
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};
DANIE_COMMANDS['ytv'] = DANIE_COMMANDS['video'];
DANIE_COMMANDS['yt'] = DANIE_COMMANDS['video'];

// .yt2s  download video at specific quality (inline)
DANIE_COMMANDS['yt2s'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("Provide a YouTube URL & quality. Example: `.yt2s <URL> & 720`");
        const parts = args.split(" & ");
        const targetUrl = parts[0]; const quality = parts[1] || "360";
        const searchRes = await yts(targetUrl);
        const info = searchRes.videos[0];
        if (!info) return reply("❌ No video found.");
        dl = await convertYtMedia(info.url, "128", quality, "mp4");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Video download failed.");
        await conn.sendMessage(from, { video: { url: dl.filePath }, mimetype: "video/mp4", caption: `🎬 *${info.title}* (${quality}p)`, fileName: "video.mp4" });
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};

// .yt3s  download video as document at specific quality
DANIE_COMMANDS['yt3s'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("Provide a YouTube URL & quality.");
        const parts = args.split(" & ");
        const targetUrl = parts[0]; const quality = parts[1] || "360";
        const searchRes = await yts(targetUrl);
        const info = searchRes.videos[0];
        if (!info) return reply("❌ No video found.");
        dl = await convertYtMedia(info.url, "128", quality, "mp4");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Video download failed.");
        await conn.sendMessage(from, { document: { url: dl.filePath }, mimetype: "video/mp4", fileName: `${info.title}.mp4`, caption: `🎬 *${info.title}* (${quality}p)` });
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};

// .csong  channel song (search + send to JID)
DANIE_COMMANDS['csong'] = async (conn, mek, from, senderJid, args, reply) => {
    let dl = null;
    try {
        if (!args) return reply("Usage: `.csong <query> & <jid>`");
        const parts = args.split(" & ");
        const queryStr = parts[0]; const jidStr = parts[1];
        if (!queryStr || !jidStr) return reply("Invalid format.");
        const searchRes = await yts(queryStr);
        const info = searchRes.videos[0];
        if (!info) return reply("No song found.");
        dl = await convertYtMedia(info.url, "128", "480", "mp3");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Audio download failed.");
        await conn.sendMessage(`${jidStr}`, { image: { url: info.thumbnail }, caption: `*${info.title}*\n⏱️ ${info.timestamp}` });
        await conn.sendMessage(`${jidStr}`, { audio: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: dl.filename, ptt: true });
        await reply(`  Sent to channel.`);
    } catch (err) { reply(`❌ Failed: ${err.message}`); }
    finally { if (dl && dl.filePath && fs.existsSync(dl.filePath)) { try { fs.unlinkSync(dl.filePath); } catch (_) {} } }
};
DANIE_COMMANDS['csongdl'] = DANIE_COMMANDS['csong'];

// Helper: Locate yt-dlp binary across platforms (Windows, Linux, GitHub Actions containers, macOS)
function getYtDlpBin() {
    const isWin = process.platform === 'win32';
    const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

    const candidates = [
        path.join(process.cwd(), binName),
        path.join(process.cwd(), 'yt-dlp'),
        path.join(process.cwd(), 'yt-dlp.exe'),
        path.join(__dirname, '..', '..', binName),
        path.join(__dirname, '..', '..', 'yt-dlp'),
        path.join(__dirname, '..', '..', 'yt-dlp.exe'),
        path.join(os.homedir ? os.homedir() : '/root', '.local', 'bin', 'yt-dlp'),
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        '/home/runner/.local/bin/yt-dlp',
        binName,
        'yt-dlp'
    ];

    for (const bin of candidates) {
        if (fs.existsSync(bin)) {
            if (!isWin) {
                try { fs.chmodSync(bin, 0o755); } catch (_) {}
            }
            return bin;
        }
    }

    // Check system PATH
    try {
        const checkCmd = isWin ? `where ${binName}` : `which yt-dlp`;
        const foundPath = require('child_process').execSync(checkCmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0];
        if (foundPath && fs.existsSync(foundPath)) {
            if (!isWin) {
                try { fs.chmodSync(foundPath, 0o755); } catch (_) {}
            }
            return foundPath;
        }
    } catch (_) {}

    return binName;
}

// Helper: Ensure yt-dlp binary exists & auto-download if running in fresh GitHub Actions / Docker container
async function ensureYtDlpBinary() {
    const bin = getYtDlpBin();
    const isWin = process.platform === 'win32';

    if (fs.existsSync(bin)) {
        if (!isWin) {
            try { fs.chmodSync(bin, 0o755); } catch (_) {}
        }
        return bin;
    }

    const targetFile = path.join(process.cwd(), isWin ? 'yt-dlp.exe' : 'yt-dlp');
    const downloadUrl = isWin
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    console.log(`[YtDlpAutoInstall] Binary missing in environment. Auto-downloading latest yt-dlp binary for ${process.platform}...`);
    try {
        const fetch = require('node-fetch');
        const res = await fetch(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
            const fileStream = fs.createWriteStream(targetFile);
            await new Promise((resolve, reject) => {
                res.body.pipe(fileStream);
                res.body.on('error', reject);
                fileStream.on('finish', resolve);
            });
            if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
                if (!isWin) {
                    fs.chmodSync(targetFile, 0o755);
                }
                console.log(`[YtDlpAutoInstall] Successfully installed yt-dlp binary to ${targetFile}`);
                return targetFile;
            }
        }
    } catch (err) {
        console.warn(`[YtDlpAutoInstall] Download failed: ${err.message}`);
    }

    return bin;
}


// Helper: Download Facebook Media with 3 engines (native yt-dlp, FDown, & OpenGraph HTML scraper)
async function downloadFacebookMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const cheerio = require('cheerio');

    const cleanUrl = url.trim();
    const tempFile = path.join(os.tmpdir(), `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = await ensureYtDlpBinary();

    // Engine 1: Native yt-dlp with --js-runtimes node & web player client
    try {
        console.log(`[Facebook] Trying native yt-dlp (${bin}) for: ${cleanUrl}`);
        const cmd = `"${bin}" --js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
        await execPromise(cmd, { timeout: 120000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            return {
                filePath: tempFile,
                title: 'Facebook Video'
            };
        }
    } catch (err) {
        console.warn(`[Facebook] Engine 1 (yt-dlp) failed: ${err.message}`);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    // Engine 2: FDown / FBDown Form Scraper
    try {
        console.log(`[Facebook] Trying FDown Scraper...`);
        const res = await fetch('https://fdown.net/download.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: new URLSearchParams({ URLfb: cleanUrl })
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        const hdUrl = $('#hdlink').attr('href') || $('#sdlink').attr('href');
        if (hdUrl && hdUrl.startsWith('http')) {
            return {
                videoUrl: hdUrl,
                title: 'Facebook Video'
            };
        }
    } catch (err) {
        console.warn(`[Facebook] Engine 2 (FDown) failed: ${err.message}`);
    }

    // Engine 3: OpenGraph HTML Video Scraper
    try {
        console.log(`[Facebook] Trying OpenGraph HTML Scraper...`);
        const res = await fetch(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        let ogVideo = $('meta[property="og:video"]').attr('content') || 
                      $('meta[property="og:video:secure_url"]').attr('content') ||
                      $('meta[property="og:video:url"]').attr('content');
        if (ogVideo) {
            ogVideo = ogVideo.replace(/&amp;/g, '&');
            return {
                videoUrl: ogVideo,
                title: $('meta[property="og:title"]').attr('content') || 'Facebook Video'
            };
        }
    } catch (err) {
        console.warn(`[Facebook] Engine 3 (OpenGraph) failed: ${err.message}`);
    }

    throw new Error('Could not extract video from this Facebook URL.');
}

// .fb / .fbdl — Facebook video download
DANIE_COMMANDS['fb'] = async (conn, mek, from, senderJid, args, reply) => {
    let tempPath = null;
    try {
        if (!args || (!args.includes('facebook.com') && !args.includes('fb.watch') && !args.includes('fb.gg') && !args.includes('fb.com'))) {
            return reply("📘 *Facebook Downloader*\nPlease provide a Facebook video or reel URL.\nExample: `.fb https://www.facebook.com/watch/...`");
        }
        const result = await downloadFacebookMedia(args.trim());
        const caption = `🎬 *Title:* ${result.title || 'Facebook Video'}`;

        if (result.videoUrl) {
            await conn.sendMessage(from, { video: { url: result.videoUrl }, mimetype: "video/mp4", caption, fileName: "fb_video.mp4" }, { quoted: mek });
        } else if (result.filePath && fs.existsSync(result.filePath)) {
            tempPath = result.filePath;
            await conn.sendMessage(from, { video: { url: result.filePath }, mimetype: "video/mp4", caption, fileName: "fb_video.mp4" }, { quoted: mek });
        } else {
            throw new Error("Could not extract video from this Facebook URL.");
        }
    } catch (err) {
        console.error('[FB Download Error]:', err.message);
        reply(`❌ Failed to download Facebook video: ${err.message}`);
    } finally {
        if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (_) {}
        }
    }
};
DANIE_COMMANDS['fbdl'] = DANIE_COMMANDS['fb'];
DANIE_COMMANDS['facebook'] = DANIE_COMMANDS['fb'];

// Helper: Download Instagram Media with 3 engines (TikWM, Ruhend, & native yt-dlp)
async function downloadInstagramMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    const cleanUrl = url.trim();

    // Engine 1: TikWM / Universal API
    try {
        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url: cleanUrl, hd: 1 })
        });
        const data = await res.json();
        if (data && data.data && (data.data.play || data.data.hdplay)) {
            return {
                videoUrl: data.data.hdplay || data.data.play,
                title: data.data.title || 'Instagram Video'
            };
        }
    } catch (_) {}

    // Engine 2: Ruhend Scraper igdl
    try {
        const { igdl } = require('ruhend-scraper');
        const result = await igdl(cleanUrl);
        if (result && result.data && result.data.length > 0 && result.data[0].url) {
            return {
                videoUrl: result.data[0].url,
                title: 'Instagram Video'
            };
        }
    } catch (_) {}

    // Engine 3: Native yt-dlp Instagram Extractor with --js-runtimes node
    const tempFile = path.join(os.tmpdir(), `ig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = await ensureYtDlpBinary();
    try {
        console.log(`[Instagram] Trying native yt-dlp (${bin})...`);
        const cmd = `"${bin}" --js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
        await execPromise(cmd, { timeout: 120000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            return {
                filePath: tempFile,
                title: 'Instagram Video'
            };
        }
    } catch (_) {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    throw new Error('Could not extract media from this Instagram URL.');
}

// .ig — Instagram reel/post download
DANIE_COMMANDS['ig'] = async (conn, mek, from, senderJid, args, reply) => {
    let tempPath = null;
    try {
        if (!args || !args.includes('instagram.com')) {
            return reply("📸 *Instagram Downloader*\nPlease provide an Instagram URL.\nExample: `.ig https://www.instagram.com/reel/...`");
        }
        const result = await downloadInstagramMedia(args.trim());
        const caption = `🎬 *Instagram Video*`;

        if (result.videoUrl) {
            await conn.sendMessage(from, { video: { url: result.videoUrl }, mimetype: "video/mp4", caption, fileName: "ig_video.mp4" }, { quoted: mek });
        } else if (result.filePath && fs.existsSync(result.filePath)) {
            tempPath = result.filePath;
            await conn.sendMessage(from, { video: { url: result.filePath }, mimetype: "video/mp4", caption, fileName: "ig_video.mp4" }, { quoted: mek });
        } else {
            throw new Error("Could not extract media from this Instagram URL.");
        }
    } catch (err) {
        console.error('[IG Download Error]:', err.message);
        reply(`❌ Failed to download Instagram content: ${err.message}`);
    } finally {
        if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (_) {}
        }
    }
};

// Helper: Download TikTok Media via TikWM & Ruhend fallback
async function downloadTikTokMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const cleanUrl = url.trim();

    // Engine 1: TikWM API
    try {
        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url: cleanUrl, hd: 1 })
        });
        const data = await res.json();
        if (data && data.data && (data.data.play || data.data.hdplay)) {
            return {
                videoUrl: data.data.hdplay || data.data.play,
                title: data.data.title || 'TikTok Video',
                author: data.data.author ? data.data.author.nickname : 'TikTok Creator'
            };
        }
    } catch (e1) {
        console.error('[TikTok TikWM Error]:', e1.message);
    }

    // Engine 2: Native yt-dlp with --js-runtimes node
    const tempFile = path.join(os.tmpdir(), `tk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = await ensureYtDlpBinary();
    try {
        console.log(`[TikTok] Trying native yt-dlp (${bin})...`);
        const cmd = `"${bin}" --js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
        await execPromise(cmd, { timeout: 120000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            return {
                filePath: tempFile,
                title: 'TikTok Video',
                author: 'TikTok Creator'
            };
        }
    } catch (e2) {
        console.error('[TikTok yt-dlp Error]:', e2.message);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    throw new Error('Could not extract TikTok video from link.');
}

// .tiktok — TikTok video download
DANIE_COMMANDS['tiktok'] = async (conn, mek, from, senderJid, args, reply) => {
    try {
        if (!args || (!args.includes('tiktok.com') && !args.includes('vt.tiktok.com'))) {
            return reply("🎵 *TikTok Downloader*\nPlease provide a TikTok video URL.\nExample: `.tk https://vt.tiktok.com/...`");
        }
        const result = await downloadTikTokMedia(args.trim());
        const caption = `🎬 *Title:* ${result.title}\n👤 *Author:* ${result.author || 'TikTok Creator'}`;
        await conn.sendMessage(from, {
            video: { url: result.videoUrl },
            mimetype: "video/mp4",
            caption,
            fileName: "tiktok_video.mp4"
        }, { quoted: mek });
    } catch (err) {
        console.error('[TikTok Download Error]:', err.message);
        reply(`❌ Failed to download TikTok video: ${err.message}`);
    }
};

// Helper: Download Twitter/X Media with 3 engines (FxTwitter API, yt-dlp with --js-runtimes node, & VxTwitter API)
async function downloadTwitterMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    const cleanUrl = url.trim();
    const tempFile = path.join(os.tmpdir(), `tw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = await ensureYtDlpBinary();
    const tweetId = cleanUrl.match(/status\/(\d+)/)?.[1];

    // Engine 1: FxTwitter API
    if (tweetId) {
        try {
            console.log(`[Twitter/X] Trying FxTwitter API for tweet ${tweetId}...`);
            const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const data = await res.json();
            if (data && data.tweet && data.tweet.media) {
                const media = data.tweet.media;
                let videoUrl = null;
                if (media.videos && media.videos.length > 0) {
                    videoUrl = media.videos[0].url;
                } else if (media.all && media.all.length > 0) {
                    const foundVideo = media.all.find(m => m.type === 'video' || m.type === 'gif');
                    if (foundVideo) videoUrl = foundVideo.url;
                }
                if (videoUrl) {
                    return {
                        videoUrl: videoUrl,
                        title: data.tweet.text || 'Twitter/X Video'
                    };
                }
            }
        } catch (err) {
            console.warn(`[Twitter/X] Engine 1 (FxTwitter) failed: ${err.message}`);
        }
    }

    // Engine 2: Native yt-dlp with --js-runtimes node
    try {
        console.log(`[Twitter/X] Trying native yt-dlp (${bin}) for: ${cleanUrl}`);
        const cmd = `"${bin}" --js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
        await execPromise(cmd, { timeout: 120000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            return {
                filePath: tempFile,
                title: 'Twitter/X Video'
            };
        }
    } catch (err) {
        console.warn(`[Twitter/X] Engine 2 (yt-dlp) failed: ${err.message}`);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    // Engine 3: VxTwitter API
    if (tweetId) {
        try {
            console.log(`[Twitter/X] Trying VxTwitter API for tweet ${tweetId}...`);
            const res = await fetch(`https://api.vxtwitter.com/status/${tweetId}`);
            const vxData = await res.json();
            if (vxData && vxData.media_extended && vxData.media_extended.length > 0) {
                const media = vxData.media_extended.find(m => m.type === 'video' || m.type === 'gif');
                if (media && media.url) {
                    return {
                        videoUrl: media.url,
                        title: vxData.text || 'Twitter/X Video'
                    };
                }
            }
        } catch (err) {
            console.warn(`[Twitter/X] Engine 3 (VxTwitter) failed: ${err.message}`);
        }
    }

    throw new Error('Could not extract video from this Twitter/X URL.');
}

// .twitter / .x / .xdl — Twitter/X video download
DANIE_COMMANDS['twitter'] = async (conn, mek, from, senderJid, args, reply) => {
    let tempPath = null;
    try {
        if (!args || (!args.includes('twitter.com') && !args.includes('x.com'))) {
            return reply("🐦 *Twitter/X Downloader*\nPlease provide a Twitter/X post URL.\nExample: `.x https://x.com/username/status/...`");
        }
        const result = await downloadTwitterMedia(args.trim());
        const caption = `🎬 *Title:* ${result.title || 'Twitter/X Video'}`;

        if (result.videoUrl) {
            await conn.sendMessage(from, { video: { url: result.videoUrl }, mimetype: "video/mp4", caption, fileName: "twitter_video.mp4" }, { quoted: mek });
        } else if (result.filePath && fs.existsSync(result.filePath)) {
            tempPath = result.filePath;
            await conn.sendMessage(from, { video: { url: result.filePath }, mimetype: "video/mp4", caption, fileName: "twitter_video.mp4" }, { quoted: mek });
        } else {
            throw new Error("Could not extract video from this Twitter/X URL.");
        }
    } catch (err) {
        console.error('[Twitter Download Error]:', err.message);
        reply(`❌ Failed to download Twitter/X video: ${err.message}`);
    } finally {
        if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch (_) {}
        }
    }
};

// .insta / .instagram / .igdl alias
DANIE_COMMANDS['insta'] = DANIE_COMMANDS['ig'];
DANIE_COMMANDS['instagram'] = DANIE_COMMANDS['ig'];
DANIE_COMMANDS['igdl'] = DANIE_COMMANDS['ig'];

// .x / .xdl alias
DANIE_COMMANDS['x'] = DANIE_COMMANDS['twitter'];
DANIE_COMMANDS['xdl'] = DANIE_COMMANDS['twitter'];

// .tk alias
DANIE_COMMANDS['tk'] = DANIE_COMMANDS['tiktok'];

// Helper: Download YouTube Media (Video / Audio) via native yt-dlp (--js-runtimes node) with cnv.cx API fallbacks
async function downloadYouTubeMediaHelper(queryOrUrl, isAudio = false) {
    let videoInfo = null;
    let targetUrl = queryOrUrl.trim();

    if (targetUrl.includes('music.youtube.com')) {
        targetUrl = targetUrl.replace('music.youtube.com', 'www.youtube.com');
    }

    if (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be')) {
        console.log(`[YouTubeHelper] Searching YouTube for query: "${targetUrl}"`);
        const searchRes = await yts(targetUrl);
        if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
            videoInfo = searchRes.videos[0];
            targetUrl = videoInfo.url;
            console.log(`[YouTubeHelper] Found video: "${videoInfo.title}" (${videoInfo.url})`);
        } else {
            throw new Error("No YouTube video found for query.");
        }
    } else {
        try {
            const searchRes = await yts(targetUrl);
            if (searchRes && searchRes.videos && searchRes.videos.length > 0) {
                videoInfo = searchRes.videos[0];
            }
        } catch (_) {}
    }

    const title = videoInfo ? videoInfo.title : 'YouTube Media';
    const timestamp = videoInfo ? videoInfo.timestamp : '';
    const views = videoInfo ? videoInfo.views : '';
    const thumbnail = videoInfo ? videoInfo.thumbnail : '';

    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFile = path.join(os.tmpdir(), `yt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);

    // Engine 1 (Primary & Highest Quality): Native yt-dlp with --js-runtimes node
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
    const bin = await ensureYtDlpBinary();
    const formatFlag = isAudio ? '-f "ba/140/251/best"' : '-f "18/b/bv*+ba"';
    const commonFlags = '--js-runtimes node --no-playlist --no-check-certificates --socket-timeout 30';

    try {
        console.log(`[YouTubeHelper] Primary Engine: Native yt-dlp (${bin}) for "${title}"...`);
        const cmd = `"${bin}" ${commonFlags} ${formatFlag} -o "${tempFile}" "${targetUrl}"`;
        await execPromise(cmd, { timeout: 120000 });

        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            if (!isAudio) {
                try { await remuxFileToFaststart(tempFile); } catch (_) {}
            }
            return {
                filePath: tempFile,
                title,
                timestamp,
                views,
                thumbnail,
                targetUrl,
                mimetype: isAudio ? "audio/mp4" : "video/mp4"
            };
        }
    } catch (ytdlpErr) {
        console.warn(`[YouTubeHelper] Primary yt-dlp engine failed: ${ytdlpErr.message}`);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    // Engine 2 (Fallback): cnv.cx API direct stream resolver
    try {
        console.log(`[YouTubeHelper] Fallback Engine: Resolving YouTube media using cnv.cx API...`);
        const format = isAudio ? 'mp3' : 'mp4';
        const directVideoUrl = await downloadYoutubeVideoUrl(targetUrl, '720', format);
        if (directVideoUrl) {
            console.log(`[YouTubeHelper] Direct media URL resolved: ${directVideoUrl}. Downloading stream...`);
            const fetch = require('node-fetch');
            const mediaRes = await fetch(directVideoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                    'Referer': 'https://frame.y2meta-uk.com/',
                    'Origin': 'https://frame.y2meta-uk.com',
                    'Accept': '*/*'
                }
            });

            if (mediaRes.ok) {
                const tempRawPath = path.join(os.tmpdir(), `yt_raw_${Date.now()}.${ext}`);
                const fileWriter = fs.createWriteStream(tempRawPath);
                await new Promise((resolve, reject) => {
                    mediaRes.body.pipe(fileWriter);
                    mediaRes.body.on('error', reject);
                    fileWriter.on('finish', resolve);
                });

                if (fs.existsSync(tempRawPath) && fs.statSync(tempRawPath).size > 1000) {
                    if (!isAudio) {
                        try { await remuxFileToFaststart(tempRawPath); } catch (_) {}
                        return {
                            filePath: tempRawPath,
                            title,
                            timestamp,
                            views,
                            thumbnail,
                            targetUrl,
                            mimetype: 'video/mp4'
                        };
                    } else {
                        return {
                            filePath: tempRawPath,
                            title,
                            timestamp,
                            views,
                            thumbnail,
                            targetUrl,
                            mimetype: 'audio/mpeg'
                        };
                    }
                }
            }
        }
    } catch (cnvErr) {
        console.warn(`[YouTubeHelper] Fallback cnv.cx API strategy failed: ${cnvErr.message}`);
    }

    throw new Error("Failed to download YouTube media. All engines failed.");
}


// .yt / .ytv / .video — YouTube Video download
DANIE_COMMANDS['yt'] = async (conn, mek, from, senderJid, args, reply) => {
    let res = null;
    try {
        if (!args) {
            return reply("🎬 *YouTube Video Downloader*\nPlease provide a YouTube URL or title search.\nExample: `.yt https://www.youtube.com/watch?v=...` or `.yt Shape of You`");
        }
        res = await downloadYouTubeMediaHelper(args, false);
        if (!res || !res.filePath || !fs.existsSync(res.filePath)) throw new Error("Could not download video.");

        console.log(`[YouTube Video] Sending video file to WhatsApp (${from})...`);
        const caption = `🎬 *Title:* *${res.title}*${res.timestamp ? `\n⏱️ *Duration:* *${res.timestamp}*` : ''}`;
        await conn.sendMessage(from, {
            video: { url: res.filePath },
            mimetype: "video/mp4",
            caption,
            fileName: `${res.title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp4`
        }, { quoted: mek });
        console.log(`[YouTube Video] Video successfully sent to ${from}!`);
    } catch (err) {
        console.error('[YouTube Video Error]:', err.message);
        reply(`❌ Failed to download YouTube video: ${err.message}`);
    } finally {
        if (res && res.filePath && fs.existsSync(res.filePath)) {
            try { fs.unlinkSync(res.filePath); } catch (_) {}
        }
    }
};
DANIE_COMMANDS['ytv'] = DANIE_COMMANDS['yt'];
DANIE_COMMANDS['video'] = DANIE_COMMANDS['yt'];

// .ytm / .song / .songdl / .music / .yta — YouTube Music / Audio download
DANIE_COMMANDS['ytm'] = async (conn, mek, from, senderJid, args, reply) => {
    let res = null;
    try {
        if (!args) {
            return reply("🎵 *YouTube Music Downloader*\nPlease provide a song title or YouTube link.\nExample: `.ytm Shape of You` or `.songdl https://youtu.be/...`");
        }
        res = await downloadYouTubeMediaHelper(args, true);
        if (!res || !res.filePath || !fs.existsSync(res.filePath)) throw new Error("Could not download audio.");

        console.log(`[YouTube Music] Sending audio file to WhatsApp (${from})...`);
        await conn.sendMessage(from, {
            audio: { url: res.filePath },
            mimetype: res.mimetype || "audio/mp4",
            fileName: `${res.title.replace(/[^a-zA-Z0-9 ]/g, '')}.m4a`,
            ptt: false
        }, { quoted: mek });
        console.log(`[YouTube Music] Audio successfully sent to ${from}!`);
    } catch (err) {
        console.error('[YouTube Music Error]:', err.message);
        reply(`❌ Failed to download audio: ${err.message}`);
    } finally {
        if (res && res.filePath && fs.existsSync(res.filePath)) {
            try { fs.unlinkSync(res.filePath); } catch (_) {}
        }
    }
};
DANIE_COMMANDS['songdl'] = DANIE_COMMANDS['ytm'];
DANIE_COMMANDS['music'] = DANIE_COMMANDS['ytm'];
DANIE_COMMANDS['yta'] = DANIE_COMMANDS['ytm'];

function parseGroupSelections(inputText, groupsList) {
    const selected = [];
    if (!inputText || typeof inputText !== 'string') return selected;
    const text = inputText.trim();

    if (text.toLowerCase() === 'all') {
        return [...groupsList];
    }

    const parts = text.split(/[\s,]+/);
    for (const part of parts) {
        if (!part) continue;
        if (part.includes('-')) {
            const [startStr, endStr] = part.split('-');
            const start = parseInt(startStr, 10);
            const end = parseInt(endStr, 10);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    const found = groupsList.find(g => g.index === i);
                    if (found && !selected.some(s => s.jid === found.jid)) {
                        selected.push(found);
                    }
                }
            }
        } else {
            const num = parseInt(part, 10);
            if (!isNaN(num)) {
                const found = groupsList.find(g => g.index === num);
                if (found && !selected.some(s => s.jid === found.jid)) {
                    selected.push(found);
                }
            } else if (part.endsWith('@g.us')) {
                const found = groupsList.find(g => g.jid === part);
                if (found && !selected.some(s => s.jid === found.jid)) {
                    selected.push(found);
                } else if (!selected.some(s => s.jid === part)) {
                    selected.push({ index: 0, jid: part, name: 'Group JID' });
                }
            }
        }
    }
    return selected;
}

async function resolveGroupNamesForList(conn, jidList) {
    if (!Array.isArray(jidList) || jidList.length === 0) return [];
    let participatingObj = {};
    try {
        participatingObj = await safeFetchParticipatingGroups(conn);
    } catch (_) {}

    const results = [];
    for (const item of jidList) {
        if (!item || typeof item !== 'string') continue;
        const cleanJid = item.trim();
        const cleanNumber = cleanJid.split('@')[0];

        const matchedGroup = participatingObj[cleanJid] || 
                             Object.values(participatingObj).find(g => g && g.id && g.id.includes(cleanNumber));

        if (matchedGroup) {
            const name = matchedGroup.subject || matchedGroup.name || cleanNumber;
            results.push({ jid: matchedGroup.id || cleanJid, name, isParticipating: true });
        } else if (cleanJid === 'all') {
            results.push({ jid: 'all', name: 'ALL Group Chats', isParticipating: true });
        }
    }
    return results;
}

async function fetchAndFormatGroupMenu(conn, from, senderJid, mode, action, reply) {
    let groupsObj = {};
    try {
        groupsObj = await safeFetchParticipatingGroups(conn);
    } catch (e) {
        console.error('[DanieWatch] Failed to fetch groups for selection:', e.message);
    }
    const groupsList = Object.values(groupsObj).map((g, idx) => ({
        index: idx + 1,
        jid: g.id,
        name: g.subject || 'Unknown Group'
    }));

    if (groupsList.length === 0) {
        return reply('❌ No active participating groups found on this account.');
    }

    const cleanSender = cleanJid(senderJid);
    pendingGroupSelection[cleanSender] = {
        mode, // 'antilink' or 'antispam'
        action, // 'add' or 'remove'
        groupsList,
        messageId: null,
        time: Date.now()
    };

    const titleMode = mode === 'antilink' ? '🛡️ ANTI-LINK' : '🚨 ANTI-SPAM';
    const actionLabel = action === 'add' ? 'ADD GROUP(S)' : 'REMOVE GROUP(S)';

    let menu = `╭─── 👥 *SELECT GROUPS: ${titleMode} (${actionLabel})* 👥 ───╮\n\n` +
               `┌─❒ *Available Groups (${groupsList.length})*\n`;

    groupsList.forEach(g => {
        menu += `│   \`${g.index}\` • 👥 *${g.name}*\n`;
    });

    menu += `└───────────────\n\n` +
            `💡 *How to Select:*\n` +
            `  • Reply to this message with number(s) (e.g. \`1\`, \`1, 2\`, \`1-3\`, or \`all\`)\n` +
            `  • Or type \`cancel\` to cancel.`;

    const sent = await reply(menu);
    if (sent && sent.key && sent.key.id) {
        pendingGroupSelection[cleanSender].messageId = sent.key.id;
    }
}

async function handleGroupSelectionReply(conn, mek, senderJid, text, reply) {
    const cleanSender = cleanJid(senderJid);
    const selectionState = pendingGroupSelection[cleanSender];
    if (!selectionState) return;

    delete pendingGroupSelection[cleanSender];

    if (text.toLowerCase() === 'cancel') {
        return reply('❌ Group selection cancelled.');
    }

    const { mode, action, groupsList } = selectionState;
    const selected = parseGroupSelections(text, groupsList);

    if (selected.length === 0) {
        return reply('❌ Invalid group selection number(s). Please try again with valid numbers from the list.');
    }

    if (mode === 'antilink') {
        const { addGroupToAntilink, removeGroupFromAntilink } = require('../Utils/antilink');
        if (action === 'add') {
            selected.forEach(g => addGroupToAntilink(g.jid));
            let res = `✅ Anti-Link protection *ADDED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { res += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(res);
        } else {
            selected.forEach(g => removeGroupFromAntilink(g.jid));
            let res = `✅ Anti-Link protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { res += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(res);
        }
    }

    if (mode === 'antispam') {
        const { addGroupToAntispam, removeGroupFromAntispam } = require('../Utils/antispam');
        if (action === 'add') {
            selected.forEach(g => addGroupToAntispam(g.jid));
            let res = `✅ Anti-Spam protection *ADDED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { res += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(res);
        } else {
            selected.forEach(g => removeGroupFromAntispam(g.jid));
            let res = `✅ Anti-Spam protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { res += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(res);
        }
    }
}

async function handleAntilinkCommand(conn, mek, from, senderJid, args, reply) {
    const isAdmin = await checkIsGroupAdmin(conn, from, senderJid);
    if (!isAdmin && !isOwner(senderJid, mek)) return reply('⛔ Only group admins or the bot owner can configure Anti-Link settings.');
    const { getAntilinkGroups, addGroupToAntilink, removeGroupFromAntilink, clearAllAntilinkGroups } = require('../Utils/antilink');
    const groups = getAntilinkGroups();
    const parts = (args || '').trim().split(/\s+/);
    const subCmd = parts[0] ? parts[0].toLowerCase() : '';

    // .antilink clear — remove all groups from protection
    if (subCmd === 'clear' || subCmd === 'reset' || subCmd === 'off') {
        clearAllAntilinkGroups();
        return reply(
            `╭─── 🛡️ *ANTI-LINK PROTECTION* 🛡️ ───╮\n\n` +
            `✅ *All groups cleared from Anti-Link protection.*\n` +
            `🔴 Anti-Link is now inactive everywhere.\n\n` +
            `💡 Send \`.antilink\` to add groups back.`
        );
    }

    // .antilink remove — show group list for removal
    if (subCmd === 'remove' || subCmd === 'del' || subCmd === 'delete' || subCmd === '-') {
        const param = parts.slice(1).join(' ').trim();
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'remove', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = removeGroupFromAntilink(param);
            const activeGroups = await resolveGroupNamesForList(conn, updated);
            return reply(`✅ *Group Removed from Anti-Link Protection!*\n\n👥 *Group:* \`${param.split('@')[0]}\`\n🛡️ *Remaining Protected Groups:* *${activeGroups.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => removeGroupFromAntilink(g.jid));
            let resText = `✅ Anti-Link protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}*\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'remove', reply);
    }

    // .antilink list — show all protected groups
    if (subCmd === 'list' || subCmd === 'groups' || subCmd === 'status') {
        const activeGroups = await resolveGroupNamesForList(conn, groups);
        let text = `╭─── 🛡️ *ANTI-LINK PROTECTED GROUPS* 🛡️ ───╮\n\n`;
        if (activeGroups.length === 0) {
            text += `ℹ️ _No groups are currently protected._\n💡 Send \`.antilink\` to select groups to protect.`;
        } else {
            activeGroups.forEach((g, idx) => {
                text += `  \`${idx + 1}\` • 👥 *${g.name}*\n`;
            });
            text += `\n🛡️ *Total:* ${activeGroups.length} group(s) protected`;
        }
        return reply(text);
    }

    // .antilink (no args) OR .antilink add — show group list for selection
    // Also handles: .antilink add, .antilink +
    const param = (subCmd === 'add' || subCmd === '+') ? parts.slice(1).join(' ').trim() : '';
    if (subCmd === 'add' || subCmd === '+') {
        if (param && param.endsWith('@g.us')) {
            const updated = addGroupToAntilink(param);
            const activeGroups = await resolveGroupNamesForList(conn, updated);
            const addedGroupObj = activeGroups.find(g => g.jid === param);
            const displayName = addedGroupObj ? addedGroupObj.name : param.split('@')[0];
            return reply(`✅ *Group Added to Anti-Link Protection!*\n\n👥 *Group:* *${displayName}*\n🛡️ *Total Protected Groups:* *${activeGroups.length}*`);
        }
        if (param) {
            let groupsObj = {};
            try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
            const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
            const selected = parseGroupSelections(param, groupsList);
            if (selected.length > 0) {
                selected.forEach(g => addGroupToAntilink(g.jid));
                let resText = `✅ Anti-Link protection *ADDED* for *${selected.length}* group(s):\n\n`;
                selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}*\n`; });
                return reply(resText);
            }
        }
    }

    // Default: Show interactive group selection menu
    return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'add', reply);
}

cmd({
    pattern: 'antilink',
    alias: ['al', 'linkprotect'],
    react: '🛡️',
    desc: 'Select groups for Anti-Link protection. Send .antilink to see group list, .antilink clear to remove all.',
    category: 'group',
    use: '.antilink [add/remove/list/clear]',
    filename: __filename
}, async (conn, mek, m, { from, q, sender }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await handleAntilinkCommand(conn, mek, from, senderJid, q, reply);
});

async function handleAntispamCommand(conn, mek, from, senderJid, args, reply) {
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can configure Anti-Spam settings.');
    const { getAntispamGroups, addGroupToAntispam, removeGroupFromAntispam, clearAllAntispamGroups } = require('../Utils/antispam');
    const { groups } = getAntispamGroups();
    const parts = (args || '').trim().split(/\s+/);
    const subCmd = parts[0] ? parts[0].toLowerCase() : '';

    // .antispam clear — remove all groups from protection
    if (subCmd === 'clear' || subCmd === 'reset' || subCmd === 'off') {
        clearAllAntispamGroups();
        return reply(
            `╭─── 🚨 *ANTI-SPAM PROTECTION* 🚨 ───╮\n\n` +
            `✅ *All groups cleared from Anti-Spam protection.*\n` +
            `🔴 Anti-Spam is now inactive everywhere.\n\n` +
            `💡 Send \`.antispam\` to add groups back.`
        );
    }

    // .antispam remove — show group list for removal
    if (subCmd === 'remove' || subCmd === 'del' || subCmd === 'delete' || subCmd === '-') {
        const param = parts.slice(1).join(' ').trim();
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'remove', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = removeGroupFromAntispam(param);
            return reply(`✅ *Group Removed from Anti-Spam Protection!*\n\n👥 *Group:* \`${param.split('@')[0]}\`\n🚨 *Remaining Protected Groups:* *${updated.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => removeGroupFromAntispam(g.jid));
            let resText = `✅ Anti-Spam protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}*\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'remove', reply);
    }

    // .antispam list — show all protected groups
    if (subCmd === 'list' || subCmd === 'groups' || subCmd === 'status') {
        const activeGroups = await resolveGroupNamesForList(conn, groups);
        let text = `╭─── 🚨 *ANTI-SPAM PROTECTED GROUPS* 🚨 ───╮\n\n`;
        if (activeGroups.length === 0) {
            text += `ℹ️ _No groups are currently protected._\n💡 Send \`.antispam\` to select groups to protect.`;
        } else {
            activeGroups.forEach((g, idx) => {
                text += `  \`${idx + 1}\` • 👥 *${g.name}*\n`;
            });
            text += `\n🚨 *Total:* ${activeGroups.length} group(s) protected`;
        }
        return reply(text);
    }

    // .antispam add — show group list for selection
    const param = (subCmd === 'add' || subCmd === '+') ? parts.slice(1).join(' ').trim() : '';
    if (subCmd === 'add' || subCmd === '+') {
        if (param && param.endsWith('@g.us')) {
            const updated = addGroupToAntispam(param);
            return reply(`✅ *Group Added to Anti-Spam Protection!*\n\n👥 *Group:* \`${param}\`\n🚨 *Total Protected Groups:* *${updated.length}*`);
        }
        if (param) {
            let groupsObj = {};
            try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
            const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
            const selected = parseGroupSelections(param, groupsList);
            if (selected.length > 0) {
                selected.forEach(g => addGroupToAntispam(g.jid));
                let resText = `✅ Anti-Spam protection *ADDED* for *${selected.length}* group(s):\n\n`;
                selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}*\n`; });
                return reply(resText);
            }
        }
    }

    // Default: Show interactive group selection menu
    return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'add', reply);
}

cmd({
    pattern: 'antispam',
    alias: ['aspam', 'spamprotect'],
    react: '🚨',
    desc: 'Select groups for Anti-Spam protection. Send .antispam to see group list, .antispam clear to remove all.',
    category: 'group',
    use: '.antispam [add/remove/list/clear]',
    filename: __filename
}, async (conn, mek, m, { from, q, sender }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await handleAntispamCommand(conn, mek, from, senderJid, q, reply);

});

DANIE_COMMANDS['antilink'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleAntilinkCommand(conn, mek, from, senderJid, args, reply);
};
DANIE_COMMANDS['al'] = DANIE_COMMANDS['antilink'];
DANIE_COMMANDS['linkprotect'] = DANIE_COMMANDS['antilink'];

DANIE_COMMANDS['antispam'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleAntispamCommand(conn, mek, from, senderJid, args, reply);
};
DANIE_COMMANDS['aspam'] = DANIE_COMMANDS['antispam'];
DANIE_COMMANDS['spamprotect'] = DANIE_COMMANDS['antispam'];

// ── Inactive Member Tracker Commands ──
const { handleResetTracker, handleNonActiveList, handleKickNonActive, handleDownloadInactiveList } = require('./inactive_cmd');

cmd({
    pattern: 'resettracker',
    alias: ['initinactive', 'resetinactive'],
    react: '🔄',
    desc: 'Initialize or reset inactive member tracking for the group',
    category: 'group',
    use: '.resettracker',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    await handleResetTracker(conn, from, reply);
});

cmd({
    pattern: 'nonactive',
    alias: ['inactive', 'checkinactive', 'nonactives'],
    react: '📊',
    desc: 'View list of inactive members in the group',
    category: 'group',
    use: '.nonactive',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    await handleNonActiveList(conn, from, reply);
});

cmd({
    pattern: 'listinactive',
    alias: ['downloadinactive', 'exportinactive'],
    react: '📄',
    desc: 'Download TXT file listing inactive members with phone numbers',
    category: 'group',
    use: '.listinactive',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    await handleDownloadInactiveList(conn, from, reply, mek);
});

cmd({
    pattern: 'kicknonactive',
    alias: ['kickinactive', 'removeinactive'],
    react: '🚪',
    desc: 'Kick specified amount of inactive members with safe random delays',
    category: 'group',
    use: '.kicknonactive <amount>',
    filename: __filename
}, async (conn, mek, m, { from, q }) => {
    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    const args = q ? q.trim().split(/\s+/) : [];
    await handleKickNonActive(conn, from, args, reply);
});

DANIE_COMMANDS['resettracker'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleResetTracker(conn, from, reply);
};
DANIE_COMMANDS['initinactive'] = DANIE_COMMANDS['resettracker'];
DANIE_COMMANDS['resetinactive'] = DANIE_COMMANDS['resettracker'];

DANIE_COMMANDS['nonactive'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleNonActiveList(conn, from, reply);
};
DANIE_COMMANDS['inactive'] = DANIE_COMMANDS['nonactive'];
DANIE_COMMANDS['checkinactive'] = DANIE_COMMANDS['nonactive'];
DANIE_COMMANDS['nonactives'] = DANIE_COMMANDS['nonactive'];

DANIE_COMMANDS['listinactive'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleDownloadInactiveList(conn, from, reply, mek);
};
DANIE_COMMANDS['downloadinactive'] = DANIE_COMMANDS['listinactive'];
DANIE_COMMANDS['exportinactive'] = DANIE_COMMANDS['listinactive'];

DANIE_COMMANDS['kicknonactive'] = async (conn, mek, from, senderJid, args, reply) => {
    await handleKickNonActive(conn, from, args, reply);
};
DANIE_COMMANDS['kickinactive'] = DANIE_COMMANDS['kicknonactive'];
DANIE_COMMANDS['removeinactive'] = DANIE_COMMANDS['kicknonactive'];

cmd({
    pattern: 'help',
    alias: ['menu', 'commands', 'h'],
    react: '📖',
    desc: 'Show all bot commands with descriptions, usage, and categorized flows',
    category: 'general',
    use: '.help',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    const senderJid = m.sender || mek.sender || from;
    if (typeof DANIE_COMMANDS['help'] === 'function') {
        await DANIE_COMMANDS['help'](conn, mek, from, senderJid, '', reply);
    }
});

// Export initUpsertListener, globalTaskQueue, isTaskRunning, and downloadCommandHandler
module.exports.initUpsertListener = initUpsertListener;
module.exports.globalTaskQueue = globalTaskQueue;
module.exports.isTaskRunning = isTaskRunning;
module.exports.downloadCommandHandler = downloadCommandHandler;
module.exports.pCommandHandler = pCommandHandler;
module.exports.DANIE_COMMANDS = DANIE_COMMANDS;


