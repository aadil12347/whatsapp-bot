const { cmd } = require('../Utils/command');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fileType = require('file-type');
const { browserHttpsAgent, fetchHtmlWithRetry, fetchTmdbMetadata, fetchTmdbById, downloadYoutubeVideoUrl, scrapePostPage, resolveLandingLink, resolveVcloudLink, resolveFinalUrl, scrapeAllPostLinks, extractDirectDownloadLinks, extractSubOptions, searchHdhub4u, extractSeriesVcloudLinks } = require('../Utils/movie_scraper');
const { searchStreamImdb, getMediaDetails, getEpisodeEmbedUrl, resolveStreamOptions, downloadStreamWithFFmpeg, verifyMediaFile } = require('../Utils/streamimdb_scraper');

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
        let fallbackText = `=� *${title}*\n\n${bodyText}\n\n`;
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
        console.log('[DanieWatch] ⏹� Active task ended: Stopped WhatsApp socket keep-alive ping.');
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
    console.warn('[DanieWatch] �� Timeout waiting for WebSocket reconnection. Attempting upload anyway...');
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
        console.error(`[DanieDownload] �R FFmpeg video re-encode failed for ${filePath}:`, encodeErr.message);
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

async function extractArchive(archivePath, targetDir) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const ext = path.extname(archivePath).toLowerCase();
    const fileSize = fs.existsSync(archivePath) ? fs.statSync(archivePath).size : 0;
    const TWO_GIB = 2 * 1024 * 1024 * 1024; // adm-zip limit

    // 1. ZIP  native system unzip (fastest C execution, 0 MB Node RAM overhead), fallback to 7z or adm-zip
    if (ext === '.zip') {
        try {
            console.log(`[DanieDownload] Extracting ZIP via native system unzip (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);
            await execAsync(`unzip -o -q "${archivePath}" -d "${targetDir}"`, { maxBuffer: 1024 * 1024 * 50 });
            return true;
        } catch (unzipErr) {
            console.warn('[DanieDownload] Native system unzip unavailable, trying 7z...');
            try {
                await execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, { maxBuffer: 1024 * 1024 * 50 });
                return true;
            } catch (err7z) {
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

    // 2. RAR  via system unrar (async non-blocking)
    if (ext === '.rar') {
        try {
            console.log('[DanieDownload] Extracting RAR via system unrar (async non-blocking)...');
            await execAsync(`unrar x -o+ "${archivePath}" "${targetDir}/"`, { maxBuffer: 1024 * 1024 * 50 });
            return true;
        } catch (err) {
            try {
                console.log('[DanieDownload] System unrar failed, trying 7z (async)...');
                await execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, { maxBuffer: 1024 * 1024 * 50 });
                return true;
            } catch (err7z) {
                console.error('[DanieDownload] unrar extraction failed:', err.message);
                throw new Error(`Failed to extract RAR archive. Error: ${err.message}`);
            }
        }
    }

    // 3. Other formats (7z, tar, gz)
    if (['.7z', '.tar', '.gz', '.tgz'].includes(ext)) {
        try {
            console.log(`[DanieDownload] Extracting ${ext} via 7z (async)...`);
            await execAsync(`7z x -y -o"${targetDir}" "${archivePath}"`, { maxBuffer: 1024 * 1024 * 50 });
            return true;
        } catch (err) {
            console.error(`[DanieDownload] 7z extraction failed for ${ext}:`, err.message);
            throw new Error(`Failed to extract ${ext} archive. Error: ${err.message}`);
        }
    }

    throw new Error(`Unsupported archive format: ${ext}. Only .zip, .rar, .7z are supported.`);
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
    // sendOptions.from (which can be a LID like "17064693616661@lid" � bogus JID).
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
        const icon = primaryTarget.type === 'group' ? '=� Group' : '=� Private Chat';
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
                });
                if (abortSignal) {
                    abortSignal.addEventListener('abort', () => {
                        reject(new Error('Aborted'));
                    });
                }
            });

            if (!streamError) {
                console.log(`[DanieDownload] Download completed. Total bytes: ${downloadedBytes}`);
                // Reject suspiciously small files (likely HTML error pages, not video/audio)
                if (downloadedBytes < 5000) {
                    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                    throw new Error(`Downloaded file too small (${downloadedBytes} bytes) - likely an error page`);
                }
                return response.headers; // success!
            }
        } catch (err) {
            if (err.message === 'Aborted') {
                if (writer) writer.destroy();
                throw err;
            }
            console.error(`[DanieDownload] Attempt ${attempts} failed:`, err.message);
            if (writer) writer.destroy();

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
    const msg = mek.message;
    if (!msg) return null;
    const contextInfo = msg.extendedTextMessage?.contextInfo || 
                        msg.imageMessage?.contextInfo || 
                        msg.videoMessage?.contextInfo || 
                        msg.documentMessage?.contextInfo;
    return contextInfo?.stanzaId || null;
}

const pendingConfig = {};
const pendingSearch = {};
const pendingGroupSelection = {};
const groupAdminCache = new Map();

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

const VEGAMOVIES_DOMAIN = process.env.VEGAMOVIES_DOMAIN || 'https://new2.vegamovies.futbol';
const ROGMOVIES_DOMAIN = process.env.ROGMOVIES_DOMAIN || 'https://new2.rogmovies.click';
const HDHUB4U_DOMAIN = process.env.HDHUB4U_DOMAIN || 'https://new3.hdhub4u.cl';

// =========================================================================
//  TASK QUEUE MANAGER  Sequential FIFO execution for .p, .d, and searches
// =========================================================================
class TaskQueueManager {
    constructor() {
        this.queue = [];
        this.activeTask = null;
        this.isProcessing = false;
    }

    add(task) {
        task.id = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        task.addedAt = Date.now();
        this.queue.push(task);
        console.log(`[QueueManager] Added task "${task.description}" (ID: ${task.id}). Pending count: ${this.queue.length}`);
        
        this.processNext();
        return task;
    }

    async processNext() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
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
            this.activeTask = null;
            this.isProcessing = false;
            if (this.queue.length === 0) {
                stopSocketKeepAlive();
            }
            setImmediate(() => this.processNext());
        }
    }

    cancelAll(senderJid) {
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
        } else {
            return { error: `Currently, only .p or .d commands can be updated in queue.` };
        }
    }

    getStatus() {
        let activeStr = 'None';
        if (this.activeTask) {
            activeStr = `= *[PROCESSING]* ${this.activeTask.description}`;
        }

        let pendingStr = 'No pending items in queue.';
        if (this.queue.length > 0) {
            pendingStr = this.queue.map((t, idx) => `  \`${idx + 1}\`  ${t.description}`).join('\n');
        }

        return `=� *Task Queue Status*\n\n` +
               `*Currently Processing:*\n${activeStr}\n\n` +
               `*Pending in Queue (${this.queue.length}):*\n${pendingStr}\n\n` +
               `_Use \`.c\` to cancel all, \`.qdel <num>\` to remove an item, or \`.qedit <num> <new_cmd>\` to update._`;
    }
}

const globalTaskQueue = new TaskQueueManager();

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

function initUpsertListener(conn) {
    if (conn.danieDownloadUpsertRegistered) return;
    conn.danieDownloadUpsertRegistered = true;
    _connInstance = conn;
    if (!conn._startupTime) conn._startupTime = Date.now();
    if (!conn._connectTimeSeconds) conn._connectTimeSeconds = Math.floor(conn._startupTime / 1000);

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
            const mek = chatUpdate.messages ? chatUpdate.messages[0] : null;
            if (!mek) return;
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
                return;
            }

            const from = mek.key.remoteJid;
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
                return;
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

                // ── 1. Anti-Link Enforcement ──
                if (isAntilinkActiveForGroup(from) && groupMsgText && containsForbiddenLink(groupMsgText)) {
                    console.log(`[AntiLink] ⚡ Forbidden link detected in group ${from} from sender ${senderJid} (fromMe=${!!mek.key.fromMe}). Text: "${groupMsgText.substring(0, 80)}"`);
                    try {
                        const isAdmin = await checkIsGroupAdmin(conn, from, senderJid);
                        if (isAdmin || mek.key.fromMe) {
                            console.log(`[AntiLink] 🛡️ Ignored — Sender ${cleanSender} is Admin, Bot Owner, or self (fromMe=${!!mek.key.fromMe}).`);
                        } else {
                            console.log(`[AntiLink] 🚨 Non-admin ${cleanSender} — Deleting message, warning & kicking...`);
                            // Step 1: Delete message for EVERYONE
                            try { await conn.sendMessage(from, { delete: mek.key }); } catch (e) { console.error('[AntiLink] Delete failed:', e.message); }
                            // Step 2: Send custom warning message
                            try {
                                await conn.sendMessage(from, {
                                    text: `⚠️ @${cleanSender} Nikal Loray, Teri MKC loray kis say puch kar link bheja`,
                                    mentions: [senderJid]
                                });
                            } catch (e) { console.error('[AntiLink] Warning failed:', e.message); }
                            // Step 3: Remove / Kick offender from group
                            try {
                                await conn.groupParticipantsUpdate(from, [senderJid], 'remove');
                                console.log(`[AntiLink] 🚪 Kicked ${senderJid} from ${from}`);
                            } catch (kickErr) {
                                console.error('[AntiLink] Kick failed:', kickErr.message);
                            }
                            return; // Stop further processing for this message
                        }
                    } catch (err) {
                        console.error('[AntiLink] Error during enforcement:', err.message);
                    }
                }

                // ── 2. Anti-Spam Enforcement (10 msgs / 2 mins) ──
                if (isAntispamActiveForGroup(from)) {
                    const spamCheck = recordMessageAndCheckSpam(senderJid, from, mek.key);
                    if (spamCheck.isSpam) {
                        console.log(`[AntiSpam] ⚡ Spam rate threshold exceeded in group ${from} from sender ${senderJid} (${spamCheck.count} msgs/2min).`);
                        try {
                            const isAdmin = await checkIsGroupAdmin(conn, from, senderJid);
                            if (isAdmin) {
                                console.log(`[AntiSpam] 🛡️ Ignored — Sender ${cleanSender} is Admin or Owner in ${from}.`);
                            } else {
                                console.log(`[AntiSpam] 🚨 Non-admin ${cleanSender} — Deleting ${spamCheck.keysToPurge.length} msgs, warning & kicking...`);
                                // Step 1: Delete ALL captured spam messages
                                if (spamCheck.keysToPurge && spamCheck.keysToPurge.length > 0) {
                                    for (const keyToDel of spamCheck.keysToPurge) {
                                        try { await conn.sendMessage(from, { delete: keyToDel }); } catch (_) {}
                                    }
                                } else {
                                    try { await conn.sendMessage(from, { delete: mek.key }); } catch (_) {}
                                }
                                // Step 2: Send custom warning message
                                try {
                                    await conn.sendMessage(from, {
                                        text: `⚠️ @${cleanSender} abe ruk jaa aj hi saray message bheje ga kiya . . \nab sukoon kar jab tak Daniyal online nahi hota 😂`,
                                        mentions: [senderJid]
                                    });
                                } catch (e) { console.error('[AntiSpam] Warning failed:', e.message); }
                                // Step 3: Remove / Kick offender from group
                                try {
                                    await conn.groupParticipantsUpdate(from, [senderJid], 'remove');
                                    console.log(`[AntiSpam] 🚪 Kicked ${senderJid} from ${from}`);
                                } catch (kickErr) {
                                    console.error('[AntiSpam] Kick failed:', kickErr.message);
                                }
                                return; // Stop further processing for this message
                            }
                        } catch (err) {
                            console.error('[AntiSpam] Error during enforcement:', err.message);
                        }
                    }
                }
            }

            // OWNER-ONLY ACCESS CHECK: Block all non-owners from messaging/sending commands to the bot
            if (!mek.key.fromMe && !isOwner(senderJid, mek)) {
                console.log(`[DanieWatch] 🔒 Access denied: Message from non-owner sender ${cleanSender} (JID: ${senderJid}) ignored.`);
                return;
            }

            // Record incoming/outgoing chat JIDs
            if (from) saveActiveChat(from, null, mek.pushName);
            if (senderJid) saveActiveChat(senderJid, null, mek.pushName);

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

            console.log(`[DanieWatch] 📱 Raw message received: from="${from}" sender="${senderJid}" cleanSender="${cleanSender}" targetJid="${targetJid}" fromMe=${mek.key.fromMe} text="${trimmedText}"`);

            const reply = async (textMsg) => {
                try {
                    return await conn.sendMessage(targetJid, { text: textMsg }, { quoted: mek });
                } catch (err1) {
                    if (cleanSender && cleanSender !== targetJid) {
                        try {
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
                    'sv', 'sr', 'sh', 'si', 'se', 'seextract', 'serieslinks', 'nexdrive', 'vcloudlinks',
                    'alive', 'allow', 'disallow', 'addowner', 'delowner', 'addsudo', 'delsudo', 'owners', 'allowed', 'sudolist', 'config', 'setgroup', 'dlstatus', 'dlconfig', 'downloadstatus',
                    'c', 'cancel', 'clearqueue', 'cancelall', 'que', 'queue', 'q', 'qstatus',
                    'd', 'p', 's', 'status', 'progress',
                    'jid', 'groupid',
                    'qdel', 'qremove', 'qedit', 'qupdate',
                    'help',
                    'song', 'songdl', 'yt1s', 'yts', 'yts1', 'video', 'yt2s', 'yt3s', 'csong', 'csongdl',
                    'ig', 'fb', 'tiktok', 'twitter', 'ytv', 'yt', 'tk', 'insta', 'instagram', 'ytm', 'music', 'yta',
                    'mvdl', 'mv', 'movie', 'mvdlinfo', 'mvdlseason', 'mvdlshowep', 'mvdlget', 'mvdlsub',
                    'antilink', 'al', 'linkprotect', 'antispam', 'aspam', 'spamprotect'
                ];

                if (!ALLOWED_COMMANDS.includes(cmdName)) {
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

            // ---- Check if it's a plain-number reply for pending config ----
            if (pendingConfig[cleanSender]) {
                const quotedId = getQuotedMessageId(mek);
                const isValidNumber = /^\d+$/.test(trimmedText);
                const isMatch = (quotedId && quotedId === pendingConfig[cleanSender].messageId) || 
                                (!quotedId && isValidNumber);
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleConfigReply for ${cleanSender}.`);
                    await handleConfigReply(conn, mek, null, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- Check if it's a reply for pending search/resolution ----
            if (pendingSearch[cleanSender]) {
                const quotedId = getQuotedMessageId(mek);
                const isValidNumber = /^\d+$/.test(trimmedText) || /^\d+[\s, \-]+/.test(trimmedText) || trimmedText.toLowerCase() === 'all';
                const isInteractiveMsg = !!(mek.message.interactiveResponseMessage || mek.message.buttonsResponseMessage || mek.message.listResponseMessage || mek.message.templateButtonReplyMessage);
                const isMatch = (quotedId && quotedId === pendingSearch[cleanSender].messageId) || 
                                (!quotedId && isValidNumber) ||
                                isInteractiveMsg;
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleSearchReply for ${cleanSender}.`);
                    await handleSearchReply(conn, mek, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- Check if it's a reply for pending antilink / antispam group selection ----
            if (pendingGroupSelection[cleanSender]) {
                const quotedId = getQuotedMessageId(mek);
                const isValidNumber = /^\d+$/.test(trimmedText) || /^\d+[\s, \-]+/.test(trimmedText) || trimmedText.toLowerCase() === 'all' || trimmedText.toLowerCase() === 'cancel';
                const isMatch = (quotedId && quotedId === pendingGroupSelection[cleanSender].messageId) || 
                                (!quotedId && isValidNumber);
                if (isMatch) {
                    console.log(`[DanieWatch] Directing reply "${trimmedText}" to handleGroupSelectionReply for ${cleanSender}.`);
                    await handleGroupSelectionReply(conn, mek, senderJid, trimmedText, reply);
                    return;
                }
            }

            // ---- AUTO-URL DETECTOR FOR OWNER (Direct Link Auto-Downloader) ----
            const urlMatch = trimmedText.match(/https?:\/\/[^\s]+/i);
            if (urlMatch && urlMatch[0]) {
                const detectedUrl = urlMatch[0];
                const lowerUrl = detectedUrl.toLowerCase();

                console.log(`[DanieWatch] 🔗 Direct URL detected from owner: "${detectedUrl}"`);

                if (lowerUrl.includes('tiktok.com')) {
                    console.log(`[DanieWatch] Auto-routing TikTok link to .tiktok handler...`);
                    await DANIE_COMMANDS['tiktok'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    return;
                }
                if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
                    console.log(`[DanieWatch] Auto-routing Instagram link to .ig handler...`);
                    await DANIE_COMMANDS['ig'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    return;
                }
                if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.gg') || lowerUrl.includes('fb.com')) {
                    console.log(`[DanieWatch] Auto-routing Facebook link to .fb handler...`);
                    await DANIE_COMMANDS['fb'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    return;
                }
                if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
                    console.log(`[DanieWatch] Auto-routing Twitter/X link to .twitter handler...`);
                    await DANIE_COMMANDS['twitter'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    return;
                }
                if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
                    if (lowerUrl.includes('music.youtube.com') || trimmedText.toLowerCase().includes('audio') || trimmedText.toLowerCase().includes('song') || trimmedText.toLowerCase().includes('mp3')) {
                        console.log(`[DanieWatch] Auto-routing YouTube Music link to .ytm handler...`);
                        await DANIE_COMMANDS['ytm'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    } else {
                        console.log(`[DanieWatch] Auto-routing YouTube Video link to .yt handler...`);
                        await DANIE_COMMANDS['yt'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    }
                    return;
                }
                if (lowerUrl.includes('nexdrive.fit') || lowerUrl.includes('vcloud.fit') || lowerUrl.includes('vcloud.zip')) {
                    console.log(`[DanieWatch] Auto-routing Series link to .se handler...`);
                    await DANIE_COMMANDS['se'](conn, mek, targetJid, senderJid, detectedUrl, reply);
                    return;
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

// Parse download command item (supports "=", space separation, or no name)
function parseDownloadItem(item) {
    let customFilename = null;
    let url = item.trim();

    const firstEqIdx = item.indexOf('=');
    if (firstEqIdx !== -1) {
        const leftPart = item.substring(0, firstEqIdx).trim();
        const rightPart = item.substring(firstEqIdx + 1).trim();
        
        // If the left part does NOT start with a URL protocol, it is the custom filename
        if (!leftPart.startsWith('http://') && !leftPart.startsWith('https://')) {
            customFilename = leftPart;
            url = rightPart;
        }
    } else {
        const lastSpaceIdx = item.lastIndexOf(' ');
        if (lastSpaceIdx !== -1) {
            const lastWord = item.substring(lastSpaceIdx + 1).trim();
            if (lastWord.startsWith('http://') || lastWord.startsWith('https://')) {
                customFilename = item.substring(0, lastSpaceIdx).trim();
                url = lastWord;
            }
        }
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
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│       ⚙️ *RECEIVER CONFIG* ⚙️       │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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

    if (['clear', 'reset', '4', 'clean'].includes(lowerText)) {
        saveSettings({ mode: 'private', targets: [], groupJid: '', groupName: '', privateJid: '', privateName: '' });
        delete pendingConfig[cleanSender];
        return reply(`╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│       🔄 *CONFIG RESET* 🔄       │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n✅ All target receivers cleared!\n\nDefault receiver reset to Private Chat: *+${cleanSender.split('@')[0]}*`);
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

    let resText = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│       ⚙️ *CONFIG SAVED* ⚙️       │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n✅ Saved *${selectedTargets.length}* target receiver(s) for Upload & Auto-Forwarding:\n\n`;
    settings.targets.forEach((t, idx) => {
        const icon = t.type === 'group' ? '👥' : '👤';
        resText += `  ${idx + 1}. ${icon} *${t.name}* (${t.jid})\n`;
    });
    return reply(resText.trim());
}

// =========================================================================
//  .setgroup   Quick shortcut to pick a group destination
// =========================================================================
cmd({
    pattern: 'setgroup',
    react: '=�',
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

            let list = '=� *Your Groups:*\n\n';
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
async function downloadCommandHandler(conn, mek, from, senderJid, q, reply, abortSignal = null, activeDownloadRef = null, preferredServer = null, silentErrors = false) {
    console.log("=== DOWNLOAD COMMAND TRIGGERED ===");
    console.log("q:", q);
    try {
        if (!q) {
            return reply(
                '�R Please provide a download link!\n\n' +
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

        for (let i = 0; i < items.length; i++) {
            if (abortSignal && abortSignal.aborted) {
                console.log('[DanieDownload] Abort signal detected. Stopping download items loop.');
                throw new Error('Aborted');
            }
            let { customFilename, url } = parseDownloadItem(items[i]);
            let targetFilename = customFilename;

            if (items.length > 1) {
                await reply(`⏳ Processing file *${i + 1}/${items.length}*...\n📥 Target: ${targetFilename || 'Auto-detect'}`);
            }

            // Direct download bypass (no movie scraping/resolution)

            // Basic URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                await reply(`❌ Invalid link format for item ${i + 1}! Skipping.\nParsed URL: \`${url}\``);
                continue;
            }

            // Determine temporary/target filename
            let tempFilename = targetFilename || ('file_' + Date.now());
            if (!targetFilename) {
                try {
                    const urlPath = new URL(url).pathname;
                    const urlFile = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                    if (urlFile && urlFile.includes('.')) {
                        tempFilename = decodeURIComponent(urlFile);
                    }
                } catch (err) {}
            }

            const tempFilePath = path.join(__dirname, 'tmp_' + Date.now() + '_' + tempFilename);

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

            // Download using resume-enabled download function
            const responseHeaders = await downloadFileWithResume(url, tempFilePath, {}, abortSignal);

            if (abortSignal && abortSignal.aborted) {
                throw new Error('Aborted');
            }

            // Extract real filename from Content-Disposition header
            const contentDisposition = (responseHeaders && responseHeaders['content-disposition']) || '';
            if (contentDisposition) {
                try {
                    const cdMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
                    if (cdMatch && cdMatch[1]) {
                        const cdFilename = decodeURIComponent(cdMatch[1].trim());
                        if (cdFilename && cdFilename.includes('.')) {
                            if (!targetFilename) tempFilename = cdFilename;
                            console.log('[DanieDownload] Detected filename from Content-Disposition:', cdFilename);
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

            // Determine extension from URL path, tempFilename, or Content-Disposition
            let ext = '';
            try {
                const urlPath = new URL(url).pathname;
                const urlFile = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                if (urlFile && urlFile.includes('.')) {
                    ext = urlFile.split('.').pop();
                }
            } catch (err) {}
            if (!ext && tempFilename && tempFilename.includes('.')) {
                ext = tempFilename.split('.').pop();
            }
            if (!ext) ext = 'mp4'; // fallback

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
            const isArchive = ['zip', 'tar', 'gz', 'tgz', 'rar', 'rar5', '7z'].includes(extLower) ||
                              ['application/zip', 'application/x-tar', 'application/x-rar-compressed', 'application/x-gzip', 'application/x-zip-compressed'].includes(mime.toLowerCase());

            // 2GB size limit applies ONLY to non-archive files.
            // Archives can be any size  individual files inside are checked after extraction.
            if (!isArchive && sizeInBytes > 2000 * 1024 * 1024) {
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
                await reply(`❌ File ${tempFilename} is too large (${sizeInMB} MB). Max upload limit is 2 GB.`);
                continue;
            }

            if (isArchive) {
                await reply(`📥 Archive detected: *${tempFilename}* (${sizeInMB} MB). Extracting files...`);
                const targetDir = path.join(__dirname, 'extracted_' + Date.now());
                try {
                    await extractArchive(tempFilePath, targetDir);

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
                            console.error(`[DanieDownload] �R Upload failed for ${finalFileName}: ${uploadErr.message}`);
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

                if (finalFileName.toLowerCase().endsWith('.mp4') || mime === 'video/mp4') {
                    await remuxFileToFaststart(tempFilePath);
                }

                await sendAndForwardFile(conn, activeTargets, {
                    document: { url: tempFilePath },
                    mimetype: mime,
                    fileName: finalFileName
                }, { quoted: destJid === from ? mek : null, from, senderJid });

                // Send completion message
                try {
                    await reply(` *Download Complete!*\n📥 *File:* ${finalFileName}\n📥 *Size:* ${sizeInMB} MB\n🎬 *Sent to:* ${destLabel}`);
                } catch (_) {}

                // Delete temporary file
                try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (_) {}
            }
        }

    } catch (error) {
        if (error.message === 'Aborted') {
            console.log('[DanieDownload] Download task aborted.');
            throw error;
        }
        console.error('Download command error:', error);
        if (!silentErrors) {
            try {
                await reply(`❌ Failed to download/upload file: ${error.message}`);
            } catch (replyErr) {
                console.error('[DanieDownload] Failed to send error reply (connection likely closed):', replyErr.message);
            }
        }
        throw error;
    }
}

async function sendStickyStatusUpdate(conn, from, currentStatusMsg, textMsg, isMajorPhaseChange = false) {
    try {
        if (isMajorPhaseChange && currentStatusMsg && currentStatusMsg.key) {
            try {
                await conn.sendMessage(from, { delete: currentStatusMsg.key });
            } catch (_) {}
            return await conn.sendMessage(from, { text: textMsg });
        } else if (currentStatusMsg && currentStatusMsg.key) {
            try {
                return await conn.sendMessage(from, { text: textMsg, edit: currentStatusMsg.key });
            } catch (editErr) {
                return await conn.sendMessage(from, { text: textMsg });
            }
        } else {
            return await conn.sendMessage(from, { text: textMsg });
        }
    } catch (_) {
        return null;
    }
}

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

async function handlePullDownStatus(conn, mek, from, reply) {
    // Delete previous sticky status message
    if (globalProgressState.statusMsg && globalProgressState.statusMsg.key) {
        try {
            await conn.sendMessage(globalProgressState.statusMsg.from || from, { delete: globalProgressState.statusMsg.key });
        } catch (_) {}
        globalProgressState.statusMsg = null;
    }

    const pendingCount = globalTaskQueue ? globalTaskQueue.queue.length : 0;
    const isTaskRunning = globalTaskQueue && globalTaskQueue.activeTask;
    const settings = loadSettings();
    const uptime = formatUptime(process.uptime());
    const memUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    let statusText =
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│   📊 *DANIEWATCH PULLDOWN STATUS* 📊   │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;

    // System info
    statusText +=
        `┌─❒ *System Overview*\n` +
        `│ ⏱️ *Uptime:* ${uptime}\n` +
        `│ 🧠 *Memory:* ${memUsed} MB\n` +
        `└───────────────\n\n`;

    // Active task
    if (globalProgressState.active && globalProgressState.percentage < 100) {
        statusText +=
            `┌─❒ *Active Download*\n` +
            `│ 🎬 *File:* ${globalProgressState.fileName}\n` +
            (globalProgressState.quality ? `│ 💾 *Quality:* ${globalProgressState.quality}\n` : '') +
            `│ 📊 *Progress:* ${globalProgressState.downloadedMB} MB / ~${globalProgressState.totalEstMB} MB (${globalProgressState.percentage}%)\n` +
            `│ ⚡ *Speed:* ${globalProgressState.speedMBs} MB/s\n` +
            `└───────────────\n\n`;
    } else if (isTaskRunning) {
        statusText +=
            `┌─❒ *Active Task*\n` +
            `│ ⚡ ${globalTaskQueue.activeTask.description || 'Processing...'}\n` +
            `│ 🔄 *Phase:* ${globalProgressState.phaseText || 'In Progress'}\n` +
            `└───────────────\n\n`;
    } else {
        statusText += `💡 *No active tasks running.*\n\n`;
    }

    // Queue
    if (pendingCount > 0) {
        statusText += `┌─❒ *Pending Queue (${pendingCount})*\n`;
        globalTaskQueue.queue.forEach((t, idx) => {
            statusText += `│   \`${idx + 1}\` • ${t.description}\n`;
        });
        statusText += `└───────────────\n\n`;
    } else {
        statusText += `📋 *Queue:* Empty\n\n`;
    }

    // Config
    let targetSummary = 'Self (Private Chat)';
    if (settings.targets && settings.targets.length > 0) {
        targetSummary = settings.targets.map(t => {
            const icon = t.type === 'group' ? '👥' : '👤';
            return `${icon} ${t.name}`;
        }).join(', ');
    } else if (settings.mode === 'group' && settings.groupName) {
        targetSummary = `👥 ${settings.groupName}`;
    }
    statusText +=
        `┌─❒ *Active Config*\n` +
        `│ ⚙️ *Mode:* ${settings.mode === 'group' ? '👥 Group' : '👤 Private'}\n` +
        `│ 🎯 *Targets:* ${targetSummary}\n` +
        `└───────────────\n\n`;

    statusText += '_Send \`.s\` anytime to refresh. Use \`.c\` to cancel all._';
    const sent = await reply(statusText);
    if (sent && sent.key) {
        globalProgressState.statusMsg = { key: sent.key, from };
    }
}

async function pCommandHandler(conn, mek, from, senderJid, q, reply, abortSignal = null, activeDownloadRef = null) {
    console.log("=== P COMMAND TRIGGERED ===");
    console.log("q:", q);
    try {
        if (!q) {
            return reply(
                '�R Please provide a TMDB link and download url(s)!\n\n' +
                '*Usage:*\n' +
                '`.p https://www.themoviedb.org/movie/550 = https://example.com/file1.mp4`\n' +
                '`.p https://www.themoviedb.org/movie/550 = https://example.com/file1.mp4, Episode 2 = https://example.com/file2.mp4`'
            );
        }

        let statusMsg = await reply('⏳ *[1/3] Fetching TMDB metadata & poster...*');
        globalProgressState.statusMsg = statusMsg && statusMsg.key ? { key: statusMsg.key, from } : null;
        globalProgressState.active = true;
        globalProgressState.phaseText = '[1/3] Fetching TMDB metadata';

        const updatePStatus = async (textMsg) => {
            globalProgressState.phaseText = textMsg.replace(/[*_]/g, '');
            if (globalProgressState.statusMsg && globalProgressState.statusMsg.key) {
                try {
                    await conn.sendMessage(globalProgressState.statusMsg.from || from, { text: textMsg, edit: globalProgressState.statusMsg.key });
                } catch (_) {}
            }
        };

        const items = q.split(',').map(item => item.trim()).filter(Boolean);
        
        // Find TMDB URL in the first item
        let { customFilename: firstCustomName, url: firstUrl } = parseDownloadItem(items[0]);
        let tmdbUrl = '';
        if (firstCustomName && /themoviedb\.org\/(movie|tv)\/(\d+)/i.test(firstCustomName)) {
            tmdbUrl = firstCustomName;
        } else if (/themoviedb\.org\/(movie|tv)\/(\d+)/i.test(firstUrl)) {
            tmdbUrl = firstUrl;
        }

        if (!tmdbUrl) {
            return updatePStatus('�R Error: First item must specify a valid TMDB URL (e.g. `.p https://www.themoviedb.org/movie/550 = ...`)');
        }

        const match = tmdbUrl.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
        const mediaType = match[1];
        const tmdbId = match[2];

        const seasonMatch = tmdbUrl.match(/\/season\/(\d+)/i);
        const specifiedSeason = seasonMatch ? parseInt(seasonMatch[1], 10) : null;

        const tmdb = await fetchTmdbById(tmdbId, mediaType, specifiedSeason);

        if (!tmdb) {
            return updatePStatus('❌ Error: Could not fetch metadata for that TMDB URL.');
        }

        const settings = loadSettings();
        const { activeTargets, primaryJid, destLabel } = getActiveTargetsAndPrimary(settings, senderJid);
        const destJid = primaryJid;

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
    react: '=�',
    desc: 'Downloads files. Supports multiple files separated by commas, Vegamovies/Rogmovies/HDHub4u auto-scraping, and TMDB integration.',
    category: 'download',
    use: '.d <link>  OR  .d name = <link>  OR  .d name1 = link1, name2 link2',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await downloadCommandHandler(conn, mek, from, senderJid, q, reply);
});

cmd({
    pattern: 'p',
    react: '<�',
    desc: 'Downloads files with TMDB metadata. The first item\'s name should be a TMDB URL.',
    category: 'download',
    use: '.p <TMDB_URL> = <link1>, <name2> = <link2>, ...',
    filename: __filename
}, async (conn, mek, m, { from, quoted, q }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    const senderJid = m.sender || mek.sender || from;
    await pCommandHandler(conn, mek, from, senderJid, q, reply);
});

cmd({
    pattern: 's',
    alias: ['status', 'progress'],
    react: '�',
    desc: 'Pulls down the active download progress card to the bottom of the chat, deleting the old message higher up.',
    category: 'download',
    use: '.s',
    filename: __filename
}, async (conn, mek, m, { from }) => {
    const reply = async (textMsg) => {
        return conn.sendMessage(from, { text: textMsg }, { quoted: mek });
    };
    await handlePullDownStatus(conn, mek, from, reply);
});

// =========================================================================
//  .groupid  unchanged from original
// =========================================================================
cmd({
    pattern: 'groupid',
    react: '<�',
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
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│   📊 *DOWNLOAD CONFIG STATUS* 📊   │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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
DANIE_COMMANDS['s'] = async (conn, mek, from, senderJid, args, reply) => {
    await handlePullDownStatus(conn, mek, from, reply);
};
DANIE_COMMANDS['status'] = DANIE_COMMANDS['s'];
DANIE_COMMANDS['progress'] = DANIE_COMMANDS['s'];

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

    pendingConfig[cleanSender] = { step: 'combined_config', groups, messageId: null };

    if (args && args.trim()) {
        return handleConfigReply(conn, mek, null, senderJid, args.trim(), reply);
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
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│       ⚙️ *RECEIVER CONFIG* ⚙️       │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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
        let list = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│   👥 *AVAILABLE GROUPS* 👥   │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;
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
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│   📊 *DOWNLOAD CONFIG STATUS* 📊   │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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
        return reply('❌ Please provide a download link!\n*Example:* \`.d https://example.com/file.mp4\`');
    }
    const label = args.length > 50 ? args.substring(0, 47) + '...' : args;
    const task = {
        type: 'd_command',
        description: `📥 Download Task: .d ${label}`,
        commandText: `.d ${args}`,
        senderJid,
        from,
        executeFn: async (signal, ref) => {
            await downloadCommandHandler(conn, mek, from, senderJid, args, reply, signal, ref);
        }
    };
    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        await reply(`📥 *Task Added to Queue* (Position #${globalTaskQueue.queue.length}):\n📌 \`.d ${label}\``);
    }
};

DANIE_COMMANDS['p'] = async (conn, mek, from, senderJid, args, reply) => {
    if (!args || !args.trim()) {
        return reply('❌ Please provide a TMDB link and download url(s)!\n*Example:* \`.p https://themoviedb.org/movie/123 = https://link.com\`');
    }
    const label = args.length > 50 ? args.substring(0, 47) + '...' : args;
    const task = {
        type: 'p_command',
        description: `🎬 TMDB Task: .p ${label}`,
        commandText: `.p ${args}`,
        senderJid,
        from,
        executeFn: async (signal, ref) => {
            await pCommandHandler(conn, mek, from, senderJid, args, reply, signal, ref);
        }
    };
    const queuedTask = globalTaskQueue.add(task);
    if (globalTaskQueue.activeTask && globalTaskQueue.activeTask.id !== queuedTask.id) {
        await reply(`🎬 *Task Added to Queue* (Position #${globalTaskQueue.queue.length}):\n📌 \`.p ${label}\``);
    }
};

// Queue Control Commands
DANIE_COMMANDS['c'] = async (conn, mek, from, senderJid, args, reply) => {
    Object.keys(pendingSearch).forEach(k => delete pendingSearch[k]);
    Object.keys(pendingConfig).forEach(k => delete pendingConfig[k]);

    const { count, activeAborted } = globalTaskQueue.cancelAll(senderJid);

    globalProgressState.active = false;
    globalProgressState.fileName = '';
    globalProgressState.quality = '';
    globalProgressState.downloadedMB = 0;
    globalProgressState.totalEstMB = 0;
    globalProgressState.speedMBs = 0;
    globalProgressState.percentage = 0;
    globalProgressState.phaseText = 'Idle';
    globalProgressState.statusMsg = null;

    globalTaskQueue.isProcessing = false;

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

    let msg = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│    🛑 *OPERATIONS CANCELLED* 🛑    │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;
    if (activeAborted) msg += `⚡ Aborted active download task.\n`;
    if (count > 0) msg += `📋 Cleared *${count}* pending queued task(s).\n`;
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
    
    let text = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│     🛡️ *ALLOWED USERS LIST* 🛡️     │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;
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
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│       ⚡ *DANIEWATCH ALIVE* ⚡       │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│        📖 *COMMAND HELP* 📖        │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +

        `┌─❒ 🎬 *Movie & Series Search*\n` +
        `│ • \`.sv <query>\` — Search VegaMovies\n` +
        `│ • \`.sr <query>\` — Search RogMovies\n` +
        `│ • \`.sh <query>\` — Search HDHub4u\n` +
        `│ • \`.si <query>\` — Search StreamIMDB\n` +
        `│ • \`.se <url>\` — Auto-download Nexdrive/VCloud series\n` +
        `│ • \`.p <tmdb> = <link>\` — Download movie with TMDB poster\n` +
        `│ • \`.d <link>\` — Direct link auto-downloader\n` +
        `└───────────────\n\n` +

        `┌─❒ 🎵 *Music & Social Downloader*\n` +
        `│ • \`.song <name/url>\` — Download YouTube Music MP3\n` +
        `│ • \`.video <name/url>\` — Download YouTube Video MP4\n` +
        `│ • \`.tiktok <url>\` — Download TikTok Video\n` +
        `│ • \`.ig <url>\` — Download Instagram Reel/Video\n` +
        `│ • \`.fb <url>\` — Download Facebook Video\n` +
        `│ • \`.twitter <url>\` — Download Twitter/X Media\n` +
        `└───────────────\n\n` +

        `┌─❒ ⚙️ *Queue & System Control*\n` +
        `│ • \`.alive\` — Check Bot Status & Specs\n` +
        `│ • \`.config\` — Configure Receiver Group/Private Chat\n` +
        `│ • \`.status\` / \`.que\` — View Task Queue Status\n` +
        `│ • \`.c\` / \`.cancel\` — Cancel all tasks & reset queue\n` +
        `│ • \`.qdel <num>\` — Remove item from queue\n` +
        `│ • \`.qedit <num> <cmd>\` — Update queued command\n` +
        `│ • \`.allow <phone>\` — Add Allowed User\n` +
        `│ • \`.disallow <phone>\` — Remove Allowed User\n` +
        `│ • \`.allowed\` — View Allowed Users List\n` +
        `└───────────────\n\n` +

        `🚀 _Send any direct link to auto-download!_`;

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
            const typeLabel = r.type === 'tv' ? '=� TV Series' : '<�� Movie';
            const yearLabel = r.year ? `(${r.year})` : '';
            return {
                id: String(idx + 1),
                title: r.title,
                description: `${typeLabel} ${yearLabel}`.trim()
            };
        });

        let responseText = `<� *IMDb / EmbedMaster Results for "${query}":*\n`;
        if (fallbackQueryUsed) {
            responseText += `��� _(Showing closest matches for "${fallbackQueryUsed}")_\n`;
        }
        responseText += `\nClick the option menu below to select your title:`;

        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `<� IMDb: "${query}"`, responseText, optionsList, mek, null, `© DanieWatch Bot`);
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

        let responseText = `�x� *${siteName} Search Results for "${query}":*\nFound ${results.length} item(s). Click below to select:`;
        const sendableFrom = mek.key.remoteJid;
        const sent = await sendInteractiveOptions(conn, sendableFrom, `�x� ${siteName} Results`, responseText, optionsList, mek, null, `© DanieWatch Bot`);
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
                const isJunk = href.includes('hubcloud') || href.includes('gpdl') || href.includes('filebee') || href.includes('gofile') || href.includes('vikingfile') || href.includes('megaup') || href.includes('fastdl') || href.includes('telegram') || href.includes('gdtot') || href.includes('drive.google');
                return isVcloud && !isJunk;
            });

            if (vcloudHosts.length === 0) {
                console.log(`[DanieSearch] No V-Cloud download links available for this item.`);
                await reply(`❌ No V-Cloud download links found for this selection.`);
                throw new Error('No V-Cloud download links available for this item.');
            }

            for (const host of vcloudHosts) {
                const href = host.href || '';
                if (!href) continue;

                if (isLandingUrl(href)) {
                    console.log(`[DanieSearch] Extracting VCloud sub-options from landing host: ${href}`);
                    try {
                        const subOpts = await extractSubOptions(href);
                        if (subOpts && subOpts.length > 0) {
                            subOpts.forEach(opt => {
                                const txt = (opt.text || '').toLowerCase();
                                const optHref = (opt.href || '').toLowerCase();
                                if (!txt.includes('login') && !txt.includes('admin') && !optHref.includes('filebee') && !optHref.includes('gofile') && !optHref.includes('fastdl') && !optHref.includes('gdtot')) {
                                    candidates.push({ name: opt.text || 'VCloud Direct Link', href: opt.href });
                                }
                            });
                        }
                    } catch (subErr) {
                        console.error(`[DanieSearch] VCloud Sub-option extraction failed for ${href}:`, subErr.message);
                    }
                }
                candidates.push({ name: host.text || 'VCloud Download Link', href: href });
            }

            // Deduplicate candidates by href
            const seenHref = new Set();
            candidates = candidates.filter(c => {
                if (!c.href || seenHref.has(c.href)) return false;
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
            const imdbDisplay = imdbId ? `<� *IMDb ID:* \`${imdbId}\` | *TMDB:* \`${selected.tmdbId}\`` : `<� *TMDB ID:* \`${selected.tmdbId}\``;

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

                let seasonText = `=� *${mediaTitle}* ${mediaYear ? `(${mediaYear})` : ''}\n${imdbDisplay}\n_${overview ? overview.substring(0, 150) + '...' : ''}_\n\n*Select a Season:*`;
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

                let qualityText = `<� *${mediaTitle}* ${mediaYear ? `(${mediaYear})` : ''}\n${imdbDisplay}\n_${overview ? overview.substring(0, 150) + '...' : ''}_\n\n*Select Download Quality:*`;
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

        let epText = `=� *${state.title}* - *Season ${chosenSeason.seasonNum}*\n\n*Select an Episode to Download:*`;
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
            let qualityText = `=� *${fullTitle}*\n\n*Select Episode Quality:*`;
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
                            const updateText = `� *EmbedMaster Download Progress:*\n<� *File:* "${formattedFileName}"\n=� *Quality:* ${chosenQuality.quality}\n=� *Downloaded:* ${info.downloadedMB} MB / ~${info.totalEstMB} MB (${info.percentage}%)\n=� *Speed:* ${info.speedMBs} MB/s`;
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
                    let durationText = `⏱� *Duration:* ${durationMins} mins`;
                    if (verification.duration < 1800 && !state.seasonNum) {
                        durationText += `\n�� *Notice:* EmbedMaster CDN provider provided a sample/short clip (${durationMins}m). For full 2hr movie files, use \`.d ${title}\`!`;
                    }

                    try {
                        const uploadText = `=� *Uploading to WhatsApp:* "${formattedFileName}"\n=� *File Size:* ${verification.sizeMB.toFixed(2)} MB\n${durationText}\n⏳ Sending video document to chat...`;
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
                            await conn.sendMessage(from, { text: `�R StreamIMDB download/upload failed for "${formattedFileName}": ${dlErr.message}`, edit: statusMsg.key });
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
                const cleanText = l.text.replace(/�\s*/g, '').replace(/\[?DanieWatch\]?/gi, '').trim();
                const isZipOrPack = l.isPack || /\bzip\b|\brar\b|\bpack\b|\bbatch\b/i.test(cleanText) || /\bzip\b|\brar\b|\bpack\b|\bbatch\b/i.test(l.href);
                
                let titleLabel = '';
                if (isZipOrPack) {
                    titleLabel = `=� ${l.resolution && l.resolution !== 'Unknown' ? l.resolution : 'Zip / Batch'}`;
                } else if (l.resolution && l.resolution !== 'Unknown') {
                    titleLabel = `<� ${l.resolution} Quality`;
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

            let bodyText = `<� *${selectedMovie.title}*\n\nSelect a download quality / link option:`;
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
                    title: `=� Download All Episodes`,
                    description: `Download all ${state.episodesList.length} episodes`
                });

                let episodeListText = `�xR� *${selectedLink.heading || selectedLink.text}*\n\nSelect episode(s) to download:`;
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
    pattern: 'sv',
    react: '�x�',
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
    react: '�x�',
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
    react: '=�',
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
    react: '<�',
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
            const badge = item.type === 'tv' ? '=� TV Series' : '<�� Movie';
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

// �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
//  YOUTUBE COMMANDS (migrated from youtube.js)
// �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
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
        const sent = await sendInteractiveOptions(conn, sendableFrom, `<� Song Search: "${args}"`, listText, optionsList, mek, null, `© DanieWatch Bot`);
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
        const sent = await sendInteractiveOptions(conn, sendableFrom, `<�� Video Search: "${args}"`, listText, optionsList, mek, null, `© DanieWatch Bot`);
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
        const caption = `<�� *${info.title}*\n⏱� ${info.timestamp} | =M�� ${info.views}\n= ${info.url}`;
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

// Helper: Locate yt-dlp binary across platforms
function getYtDlpBin() {
    const candidates = [
        path.join(process.cwd(), 'yt-dlp.exe'),
        path.join(process.cwd(), 'yt-dlp'),
        path.join(__dirname, '..', '..', 'yt-dlp.exe'),
        path.join(__dirname, '..', '..', 'yt-dlp'),
        'yt-dlp.exe',
        'yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        '/home/runner/.local/bin/yt-dlp'
    ];
    for (const bin of candidates) {
        if (fs.existsSync(bin)) return bin;
    }
    return 'yt-dlp';
}

// Helper: Download Facebook Media with 3 engines (native yt-dlp, Ruhend fbdl, & fb-downloader)
async function downloadFacebookMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    const cleanUrl = url.trim();
    const tempFile = path.join(os.tmpdir(), `fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = getYtDlpBin();

    // Engine 1: Native yt-dlp (Most reliable for FB reels, videos, stories, watch links)
    try {
        console.log(`[Facebook] Trying native yt-dlp (${bin}) for: ${cleanUrl}`);
        const cmd = `"${bin}" --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
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

    // Engine 2: Ruhend Scraper fbdl
    try {
        console.log(`[Facebook] Trying Ruhend fbdl...`);
        const { fbdl } = require('ruhend-scraper');
        const result = await fbdl(cleanUrl);
        if (result && (result.video || result.hd || result.sd || (result.data && result.data.length > 0))) {
            const vUrl = result.video || result.hd || result.sd || (result.data && result.data[0] ? result.data[0].url : null);
            if (vUrl) {
                return {
                    videoUrl: vUrl,
                    title: result.title || 'Facebook Video'
                };
            }
        }
    } catch (err) {
        console.warn(`[Facebook] Engine 2 (Ruhend) failed: ${err.message}`);
    }

    // Engine 3: @xaviabot/fb-downloader fallback
    try {
        console.log(`[Facebook] Trying @xaviabot/fb-downloader fallback...`);
        const fbdlPkg = require('@xaviabot/fb-downloader');
        const result = await fbdlPkg(cleanUrl);
        if (result && (result.hd || result.sd)) {
            return {
                videoUrl: result.hd || result.sd,
                title: result.title || 'Facebook Video'
            };
        }
    } catch (err) {
        console.warn(`[Facebook] Engine 3 (fb-downloader) failed: ${err.message}`);
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

// Helper: Download Instagram Media with 3 engines (API, Ruhend, & native yt-dlp)
async function downloadInstagramMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    // Engine 1: TikWM / Indown API
    try {
        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url: url.trim(), hd: 1 })
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
        const result = await igdl(url.trim());
        if (result && result.data && result.data.length > 0 && result.data[0].url) {
            return {
                videoUrl: result.data[0].url,
                title: 'Instagram Video'
            };
        }
    } catch (_) {}

    // Engine 3: Native yt-dlp Instagram Video Extractor
    const tempFile = path.join(os.tmpdir(), `ig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const ytdlpCandidates = ['yt-dlp', '/usr/local/bin/yt-dlp', '/home/runner/.local/bin/yt-dlp'];
    for (const bin of ytdlpCandidates) {
        try {
            console.log(`[Instagram] Trying native ${bin} for reel extraction...`);
            const cmd = `${bin} --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba" -o "${tempFile}" "${url.trim()}"`;
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
    // Engine 1: TikWM API
    try {
        const res = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ url: url.trim(), hd: 1 })
        });
        const data = await res.json();
        if (data && data.data && (data.data.play || data.data.hdplay)) {
            return {
                videoUrl: data.data.hdplay || data.data.play,
                title: data.data.title || 'TikTok Video',
                author: data.data.author ? data.data.author.nickname : 'TikTok Creator',
                music: data.data.music
            };
        }
    } catch (e1) {
        console.error('[TikTok TikWM Error]:', e1.message);
    }

    // Engine 2: Ruhend Scraper Fallback
    try {
        const { tiktokdl } = require('ruhend-scraper');
        const result = await tiktokdl(url.trim());
        if (result && (result.video || result.play)) {
            return {
                videoUrl: result.video || result.play,
                title: result.title || 'TikTok Video',
                author: result.author || 'TikTok Creator'
            };
        }
    } catch (e2) {
        console.error('[TikTok Ruhend Error]:', e2.message);
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

// Helper: Download Twitter/X Media with 3 engines (yt-dlp, VxTwitter API, & Cobalt fallback)
async function downloadTwitterMedia(url) {
    const fetch = require('node-fetch');
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);

    const cleanUrl = url.trim();
    const tempFile = path.join(os.tmpdir(), `tw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp4`);
    const bin = getYtDlpBin();

    // Engine 1: Native yt-dlp (Primary & Most reliable for Twitter/X)
    try {
        console.log(`[Twitter/X] Trying native yt-dlp (${bin}) for: ${cleanUrl}`);
        const cmd = `"${bin}" --no-playlist --no-check-certificates --socket-timeout 30 -f "b/bv*+ba/best" -o "${tempFile}" "${cleanUrl}"`;
        await execPromise(cmd, { timeout: 120000 });
        if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            return {
                filePath: tempFile,
                title: 'Twitter/X Video'
            };
        }
    } catch (err) {
        console.warn(`[Twitter/X] Engine 1 (yt-dlp) failed: ${err.message}`);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
    }

    // Engine 2: VxTwitter API
    try {
        console.log(`[Twitter/X] Trying VxTwitter API...`);
        const tweetId = cleanUrl.match(/status\/(\d+)/)?.[1];
        if (tweetId) {
            const vxRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${tweetId}`);
            const vxData = await vxRes.json();
            if (vxData && vxData.media_extended && vxData.media_extended.length > 0) {
                const media = vxData.media_extended.find(m => m.type === 'video' || m.type === 'gif');
                if (media && media.url) {
                    return {
                        videoUrl: media.url,
                        title: vxData.text || 'Twitter/X Video'
                    };
                }
            }
        }
    } catch (err) {
        console.warn(`[Twitter/X] Engine 2 (VxTwitter) failed: ${err.message}`);
    }

    // Engine 3: Cobalt API fallback
    try {
        console.log(`[Twitter/X] Trying Cobalt API fallback...`);
        const cobRes = await fetch('https://co.wuk.sh/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: cleanUrl })
        });
        const cobData = await cobRes.json();
        if (cobData && cobData.url) {
            return {
                videoUrl: cobData.url,
                title: 'Twitter/X Video'
            };
        }
    } catch (err) {
        console.warn(`[Twitter/X] Engine 3 (Cobalt) failed: ${err.message}`);
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

// Helper: Download YouTube Media (Video / Audio) via cnv.cx API direct stream (same as .p trailer) with yt-dlp fallbacks
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

    const format = isAudio ? 'mp3' : 'mp4';
    const ext = isAudio ? 'mp3' : 'mp4';
    const tempFile = path.join(os.tmpdir(), `yt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`);

    // Engine 1 (Primary): Use cnv.cx direct stream resolver (SAME METHOD AS .p TRAILER DOWNLOAD)
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

    // Engine 2 (Fallback): System / Local yt-dlp binaries
    const util = require('util');
    const execPromise = util.promisify(require('child_process').exec);
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

    let menu = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
               `│  👥 *SELECT GROUPS: ${titleMode} (${actionLabel})* 👥  │\n` +
               `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
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
    if (!isOwner(senderJid)) return reply('❌ Only the bot owner can configure Anti-Link settings.');
    const { getAntilinkData, saveAntilinkData, addGroupToAntilink, removeGroupFromAntilink } = require('../Utils/antilink');
    const { enabled, groups } = getAntilinkData();
    const parts = (args || '').trim().split(/\s+/);
    const subCmd = parts[0] ? parts[0].toLowerCase() : '';
    const param = parts.slice(1).join(' ').trim();

    if (subCmd === 'on' || subCmd === 'enable' || subCmd === '1' || subCmd === 'true') {
        if (from && from.endsWith('@g.us') && !groups.some(g => g.includes(from.split('@')[0]))) {
            groups.push(from);
        }
        saveAntilinkData(true, groups);
        return reply(
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│      🛡️ *ANTI-LINK PROTECTION* 🛡️      │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
            `✅ *Global Anti-Link Status:* *🟢 ON (ENABLED)*\n` +
            `🌐 *Allowed Platforms:* *TikTok, Facebook, Instagram, Twitter/X*\n\n` +
            `👥 *Protected Groups (${groups.length}):*\n${groups.length > 0 ? groups.map((g, i) => `  ${i + 1}. \`${g}\``).join('\n') : '  _ALL Groups (Default)_'}\n\n` +
            `🚨 *Action:* Anyone sending non-whitelisted links will have their message deleted, warning sent & kicked from group.`
        );
    }

    if (subCmd === 'off' || subCmd === 'disable' || subCmd === '0' || subCmd === 'false') {
        saveAntilinkData(false, groups);
        return reply(
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│      🛡️ *ANTI-LINK PROTECTION* 🛡️      │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
            `❌ *Global Anti-Link Status:* *🔴 OFF (DISABLED)*\n\n` +
            `💡 *Action:* Anti-Link link protection is now paused globally.`
        );
    }

    if (subCmd === 'add' || subCmd === '+') {
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'add', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = addGroupToAntilink(param);
            return reply(`✅ *Group Added to Anti-Link Protection List!*\n\n👥 *Group JID:* \`${param}\` \n🛡️ *Total Protected Groups:* *${updated.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => addGroupToAntilink(g.jid));
            let resText = `✅ Anti-Link protection *ADDED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'add', reply);
    }

    if (subCmd === 'remove' || subCmd === 'del' || subCmd === 'delete' || subCmd === '-') {
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'remove', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = removeGroupFromAntilink(param);
            return reply(`✅ *Group Removed from Anti-Link Protection List!*\n\n👥 *Group JID:* \`${param}\` \n🛡️ *Total Protected Groups:* *${updated.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => removeGroupFromAntilink(g.jid));
            let resText = `✅ Anti-Link protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antilink', 'remove', reply);
    }

    if (subCmd === 'list' || subCmd === 'groups') {
        let text = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│   🛡️ *PROTECTED ANTI-LINK GROUPS* 🛡️   │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;
        if (groups.length === 0) {
            text += `ℹ️ _No specific groups in list. Anti-Link applies to ALL group chats when ON._`;
        } else {
            groups.forEach((g, idx) => {
                text += `  \`${idx + 1}\` • 👥 \`${g}\` \n`;
            });
        }
        return reply(text);
    }

    // Default Status & Control Menu
    const statusLabel = enabled ? '🟢 *ON*' : '🔴 *OFF*';
    const isCurrentGroupProtected = groups.some(g => g.includes(from.split('@')[0]));
    const currentGroupLabel = from.endsWith('@g.us') ? (isCurrentGroupProtected ? '🟢 *Protected*' : '🔴 *Not Protected*') : 'N/A (Private Chat)';

    return reply(
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│      🛡️ *ANTI-LINK CONTROL MENU* 🛡️     │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
        `📊 *Global Status:* ${statusLabel}\n` +
        `📍 *This Group Status:* ${currentGroupLabel}\n` +
        `🛡️ *Protected Groups:* *${groups.length}*\n\n` +
        `┌─❒ *Available Commands*\n` +
        `│  1️⃣ \`.antilink on\`        ➜ Turn Anti-Link Global ON\n` +
        `│  2️⃣ \`.antilink off\`       ➜ Turn Anti-Link Global OFF\n` +
        `│  3️⃣ \`.antilink add\`       ➜ Select & Add groups to Anti-Link list\n` +
        `│  4️⃣ \`.antilink remove\`    ➜ Select & Remove groups from Anti-Link list\n` +
        `│  5️⃣ \`.antilink list\`      ➜ List all protected groups\n` +
        `└───────────────`
    );
}

cmd({
    pattern: 'antilink',
    alias: ['al', 'linkprotect'],
    react: '🛡️',
    desc: 'Toggle Anti-Link protection ON or OFF, add/remove groups, and show status.',
    category: 'group',
    use: '.antilink [on/off/add/remove/list]',
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
    const { getAntispamData, saveAntispamData, addGroupToAntispam, removeGroupFromAntispam } = require('../Utils/antispam');
    const { enabled, groups, limit, windowMs } = getAntispamData();
    const parts = (args || '').trim().split(/\s+/);
    const subCmd = parts[0] ? parts[0].toLowerCase() : '';
    const param = parts.slice(1).join(' ').trim();

    if (subCmd === 'on' || subCmd === 'enable' || subCmd === '1' || subCmd === 'true') {
        if (from && from.endsWith('@g.us') && !groups.some(g => g.includes(from.split('@')[0]))) {
            groups.push(from);
        }
        saveAntispamData(true, groups, limit, windowMs);
        return reply(
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│      🚨 *ANTI-SPAM PROTECTION* 🚨      │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
            `✅ *Global Anti-Spam Status:* *🟢 ON (ENABLED)*\n` +
            `⏱️ *Rate Limit:* *${limit} messages / 2 minutes*\n\n` +
            `👥 *Protected Groups (${groups.length}):*\n${groups.length > 0 ? groups.map((g, i) => `  ${i + 1}. \`${g}\``).join('\n') : '  _ALL Groups (Default)_'}\n\n` +
            `🚨 *Action:* Anyone sending >10 messages in 2 minutes will have their messages deleted, warning sent & kicked from group.`
        );
    }

    if (subCmd === 'off' || subCmd === 'disable' || subCmd === '0' || subCmd === 'false') {
        saveAntispamData(false, groups, limit, windowMs);
        return reply(
            `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
            `│      🚨 *ANTI-SPAM PROTECTION* 🚨      │\n` +
            `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
            `❌ *Global Anti-Spam Status:* *🔴 OFF (DISABLED)*\n\n` +
            `💡 *Action:* Anti-Spam rate limiting is now paused globally.`
        );
    }

    if (subCmd === 'add' || subCmd === '+') {
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'add', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = addGroupToAntispam(param);
            return reply(`✅ *Group Added to Anti-Spam Protection List!*\n\n👥 *Group JID:* \`${param}\` \n🚨 *Total Protected Groups:* *${updated.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => addGroupToAntispam(g.jid));
            let resText = `✅ Anti-Spam protection *ADDED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'add', reply);
    }

    if (subCmd === 'remove' || subCmd === 'del' || subCmd === 'delete' || subCmd === '-') {
        if (!param) {
            return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'remove', reply);
        }
        if (param.endsWith('@g.us')) {
            const updated = removeGroupFromAntispam(param);
            return reply(`✅ *Group Removed from Anti-Spam Protection List!*\n\n👥 *Group JID:* \`${param}\` \n🚨 *Total Protected Groups:* *${updated.length}*`);
        }
        let groupsObj = {};
        try { groupsObj = await safeFetchParticipatingGroups(conn); } catch (_) {}
        const groupsList = Object.values(groupsObj).map((g, idx) => ({ index: idx + 1, jid: g.id, name: g.subject || 'Unknown Group' }));
        const selected = parseGroupSelections(param, groupsList);
        if (selected.length > 0) {
            selected.forEach(g => removeGroupFromAntispam(g.jid));
            let resText = `✅ Anti-Spam protection *REMOVED* for *${selected.length}* group(s):\n\n`;
            selected.forEach((g, idx) => { resText += `  ${idx + 1}. 👥 *${g.name}* (\`${g.jid}\`)\n`; });
            return reply(resText);
        }
        return await fetchAndFormatGroupMenu(conn, from, senderJid, 'antispam', 'remove', reply);
    }

    if (subCmd === 'list' || subCmd === 'groups') {
        let text = `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n│   🚨 *PROTECTED ANTI-SPAM GROUPS* 🚨   │\n╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n`;
        if (groups.length === 0) {
            text += `ℹ️ _No specific groups in list. Anti-Spam applies to ALL group chats when ON._`;
        } else {
            groups.forEach((g, idx) => {
                text += `  \`${idx + 1}\` • 👥 \`${g}\` \n`;
            });
        }
        return reply(text);
    }

    // Default Status & Control Menu
    const statusLabel = enabled ? '🟢 *ON*' : '🔴 *OFF*';
    const isCurrentGroupProtected = groups.some(g => g.includes(from.split('@')[0]));
    const currentGroupLabel = from.endsWith('@g.us') ? (isCurrentGroupProtected ? '🟢 *Protected*' : '🔴 *Not Protected*') : 'N/A (Private Chat)';

    return reply(
        `╭────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╮\n` +
        `│      🚨 *ANTI-SPAM CONTROL MENU* 🚨     │\n` +
        `╰────────────── ⋆ ⋅ ✦ ⋅ ⋆ ──────────────╯\n\n` +
        `📊 *Global Status:* ${statusLabel}\n` +
        `📍 *This Group Status:* ${currentGroupLabel}\n` +
        `🚨 *Rate Limit:* *10 msgs / 2 mins*\n` +
        `👥 *Protected Groups:* *${groups.length}*\n\n` +
        `┌─❒ *Available Commands*\n` +
        `│  1️⃣ \`.antispam on\`        ➜ Turn Anti-Spam Global ON\n` +
        `│  2️⃣ \`.antispam off\`       ➜ Turn Anti-Spam Global OFF\n` +
        `│  3️⃣ \`.antispam add\`       ➜ Select & Add groups to Anti-Spam list\n` +
        `│  4️⃣ \`.antispam remove\`    ➜ Select & Remove groups from Anti-Spam list\n` +
        `│  5️⃣ \`.antispam list\`      ➜ List all protected groups\n` +
        `└───────────────`
    );
}

cmd({
    pattern: 'antispam',
    alias: ['aspam', 'spamprotect'],
    react: '🚨',
    desc: 'Toggle Anti-Spam (10 msgs / 2 mins) protection ON or OFF, add/remove groups, and show status.',
    category: 'group',
    use: '.antispam [on/off/add/remove/list]',
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

// Export initUpsertListener, globalTaskQueue, and isTaskRunning
module.exports.initUpsertListener = initUpsertListener;
module.exports.globalTaskQueue = globalTaskQueue;
module.exports.isTaskRunning = isTaskRunning;
module.exports.DANIE_COMMANDS = DANIE_COMMANDS;

