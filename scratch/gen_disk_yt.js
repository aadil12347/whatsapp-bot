const fs = require('fs');
const path = require('path');

const updatedYoutubeCode = `const { cmd, commands } = require('../Utils/command');
const { fetchLatestBaileysVersion, downloadContentFromMessage } = require('anju-xpro-baileys');
const yts = require('yt-search');
const axios = require('axios');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const configExtra = require('../../customization');

const backtick = "\`";

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

async function convertYtMedia(ytUrl, audioBitrate, videoQuality, format) {
    const tempRawPath = path.join(os.tmpdir(), \`yt_raw_\${Date.now()}_\${Math.random().toString(36).substr(2, 5)}.\${format}\`);
    const tempFixedPath = path.join(os.tmpdir(), \`yt_fixed_\${Date.now()}_\${Math.random().toString(36).substr(2, 5)}.\${format}\`);

    try {
        console.log("[YouTube API] Fetching API key...");
        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: defaultHeaders });
        if (!keyRes.ok) throw new Error("Key fetch failed");
        const { key } = await keyRes.json();

        console.log("[YouTube API] Requesting download conversion link...");
        const bodyParams = new URLSearchParams({
            link: ytUrl,
            format: format,
            audioBitrate: audioBitrate,
            videoQuality: videoQuality,
            filenameStyle: "pretty",
            vCodec: "h264"
        });

        const convRes = await fetch("https://cnv.cx/v2/converter", {
            method: "POST",
            headers: {
                ...defaultHeaders,
                "Content-Type": "application/x-www-form-urlencoded",
                key: key
            },
            body: bodyParams
        });

        if (!convRes.ok) throw new Error("Conversion failed");
        const convJson = await convRes.json();
        if (!convJson.url) throw new Error("No download URL found in response");

        console.log("[YouTube API] Downloading stream directly to disk:", tempRawPath);
        const fileRes = await fetch(convJson.url, { headers: defaultHeaders });
        if (!fileRes.ok) throw new Error("File download failed");

        const fileStream = fs.createWriteStream(tempRawPath);
        await new Promise((resolve, reject) => {
            fileRes.body.pipe(fileStream);
            fileRes.body.on('error', reject);
            fileStream.on('finish', resolve);
        });

        const rawSize = fs.existsSync(tempRawPath) ? fs.statSync(tempRawPath).size : 0;
        console.log(\`[YouTube API] Raw download complete (\${rawSize} bytes)\`);

        let mime = format === 'mp4' ? "video/mp4" : "audio/mpeg";

        if (format === 'mp4') {
            console.log("[YouTube API] Remuxing MP4 to faststart on disk...");
            try {
                execSync(\`ffmpeg -y -i "\${tempRawPath}" -c copy -movflags +faststart "\${tempFixedPath}"\`, { stdio: 'ignore' });
                if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                    console.log("[YouTube API] Faststart remux succeeded!");
                    try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                    return { filePath: tempFixedPath, filename: convJson.filename, mimetype: mime };
                }
            } catch (e) {
                console.error("[YouTube API] Faststart copy remux failed, attempting x264 transcode:", e.message);
                try {
                    execSync(\`ffmpeg -y -i "\${tempRawPath}" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "\${tempFixedPath}"\`, { stdio: 'ignore' });
                    if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
                        return { filePath: tempFixedPath, filename: convJson.filename, mimetype: mime };
                    }
                } catch (transErr) {
                    console.error("[YouTube API] Transcode failed too, using raw download:", transErr.message);
                }
            }
        }

        return { filePath: tempRawPath, filename: convJson.filename, mimetype: mime };
    } catch (err) {
        console.error("[YouTube Scraper Error]:", err);
        try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath); } catch (_) {}
        try { if (fs.existsSync(tempFixedPath)) fs.unlinkSync(tempFixedPath); } catch (_) {}
        return null;
    }
}

function extractYtId(urlStr) {
    const regex = /(?:https?:\\/\\/)?(?:www\\.)?(?:youtube\\.com\\/(?:watch\\?v=|embed\\/|v\\/|shorts\\/|playlist\\?list=)|youtu\\.be\\/)([a-zA-Z0-9_-]{11})/;
    const match = urlStr.match(regex);
    return match ? match[1] : null;
}

function normalizeYtUrl(urlStr) {
    const id = extractYtId(urlStr);
    return id ? \`https://www.youtube.com/watch?v=\${id}\` : urlStr;
}

// ------------------- COMMANDS -------------------

cmd({
    pattern: "song",
    desc: "To download songs.",
    react: "🎵",
    category: "download",
    use: ".yts numba ha",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please provide a search query.");

        const searchRes = await yts(q);
        const videos = searchRes.videos.slice(0, 10);
        if (!videos.length) return reply("No Songs found.");

        const buttons = videos.map((item, idx) => ({
            buttonId: \`\${prefix}songdl \${item.url}\`,
            buttonText: { displayText: \`*\${idx + 1}. \${item.title}*\` },
            type: 1
        }));

        const imgUrl = configExtra.IMG;
        const payload = {
            image: { url: imgUrl },
            caption: \`\n\${configExtra.SIGNATURE(config)}\n> \${backtick}*HELLO THERE \${pushname}*\${backtick}\`,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.log(err);
        reply(\`Error: \${err.message || err}\`);
    }
});

cmd({
    pattern: "songdl",
    desc: "To download songs.",
    use: ".song lelena",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please give me a URL or title.");

        const cleanUrl = normalizeYtUrl(q);
        const searchRes = await yts(cleanUrl);
        const info = searchRes.videos[0];
        const videoUrl = info.url;

        const captionText = configExtra.SONG
            ? configExtra.SONG(info, pushname, backtick)
            : \`\n\${configExtra.SIGNATURE(config)}\n> 𝙷𝚎𝚕𝚕𝚘 𝚃𝚑𝚎𝚛𝚎 *\${pushname}*\n> ==========================\n> \${backtick}[  S  O  N  G    D  L  ]\${backtick}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> 🎶 *Title:* \${info.title}\n> ⏱️ *Duration:* \${info.timestamp}\n> 👁️ *Views:* \${info.views}\n> 📅 *Uploaded On:* \${info.ago}\n> 🔗 *Link:* \${info.url}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> ==========================\`;

        const buttons = [
            { buttonId: prefix + \`yt1s \${videoUrl} & 1\`, buttonText: { displayText: "*Audio File*" }, type: 1 },
            { buttonId: prefix + \`yt1s \${videoUrl} & 2\`, buttonText: { displayText: "*Document File*" }, type: 1 },
            { buttonId: prefix + \`yt1s \${videoUrl} & 3\`, buttonText: { displayText: "*Voice Note*" }, type: 1 }
        ];

        const payload = {
            image: { url: info.thumbnail },
            caption: captionText,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.error(err);
        reply(\`\${err.message || err}\`);
    }
});

cmd({
    pattern: "yt1s",
    desc: "To download songs.",
    dontAddCommandList: true,
    filename: __filename
}, async (conn, mek, m, { from, q, reply, getThumbnailBuffer, config }) => {
    let dl = null;
    try {
        if (!q) return reply("Please provide a search query.");
        const [query, choice] = q.split(" & ");
        if (!query || !choice) return reply("Invalid format. Use: *yt1s <search term> & <choice>*");

        const searchRes = await yts(query);
        const info = searchRes.videos[0];
        if (!info) return reply("No video found.");

        m.react("⬇️");
        dl = await convertYtMedia(info.url, "128", "480", "mp3");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Audio download failed.");

        const thumbBuf = await getThumbnailBuffer(info.thumbnail);
        const captionText = configExtra.YTMP3
            ? configExtra.YTMP3(info)
            : \`\n\${configExtra.SIGNATURE(config)}\n> ==========================\n> ➥ *Title:* \${info.title}\n> ➥ *Duration:* \${info.timestamp}\n> ➥ *Uploaded On:* \${info.ago}\n> ➥ *Link:* \${info.url}\n> ==========================\`;

        m.react("⬆️");
        if (choice === '1') {
            await conn.sendMessage(from, { audio: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: \`\${info.title}.mp3\`, caption: captionText, ptt: false });
        } else if (choice === '2') {
            await conn.sendMessage(from, { document: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: \`\${info.title}.mp3\`, caption: captionText, jpegThumbnail: thumbBuf });
        } else if (choice === '3') {
            await conn.sendMessage(from, { audio: { url: dl.filePath }, mimetype: "audio/mp4", ptt: true });
        }
        m.react("✅");
    } catch (err) {
        console.log(err);
        reply(\`Failed to download or send audio. Error: \${err.message}\`);
    } finally {
        if (dl && dl.filePath && fs.existsSync(dl.filePath)) {
            try { fs.unlinkSync(dl.filePath); } catch (_) {}
        }
    }
});

cmd({
    pattern: "yts",
    desc: "To search for videos on YouTube.",
    react: "🎥",
    category: "search",
    use: ".yts numba ha",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please provide a search query.");

        const searchRes = await yts(q);
        const videos = searchRes.videos.slice(0, 10);
        if (!videos.length) return reply("No videos found.");

        const buttons = videos.map((item, idx) => ({
            buttonId: \`\${prefix}yts1 \${item.url}\`,
            buttonText: { displayText: \`*\${idx + 1}. \${item.title}*\` },
            type: 1
        }));

        const imgUrl = configExtra.IMG;
        const payload = {
            image: { url: imgUrl },
            caption: \`\n\${configExtra.SIGNATURE(config)}\n> \${backtick}*HELLO THERE \${pushname}*\${backtick}\`,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.log(err);
        reply(\`Error: \${err.message || err}\`);
    }
});

cmd({
    pattern: "yts1",
    desc: "To download videos.",
    react: "📂",
    use: ".video alone part 2",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please give me a URL or title.");

        const cleanUrl = normalizeYtUrl(q);
        const searchRes = await yts(cleanUrl);
        const info = searchRes.videos[0];
        const videoUrl = info.url;

        const captionText = configExtra.VIDEO
            ? configExtra.VIDEO(info, pushname, backtick)
            : \`\n\${configExtra.SIGNATURE(config)}\n> 𝙷𝚎𝚕𝚕𝚘 𝚃𝚑𝚎𝚛𝚎 *\${pushname}*\n> ==========================\n> \${backtick}[  V  I  D  E  O    D  L  ]\${backtick}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> 🎶 *Title:* \${info.title}\n> ⏱️ *Duration:* \${info.timestamp}\n> 👁️ *Views:* \${info.views}\n> 📅 *Uploaded On:* \${info.ago}\n> 🔗 *Link:* \${info.url}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> ==========================\`;

        const buttons = [
            { buttonId: prefix + \`yt2s \${videoUrl} & 144\`, buttonText: { displayText: "*Video File* 144p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 360\`, buttonText: { displayText: "*Video File* 360p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 480\`, buttonText: { displayText: "*Video File* 480p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 720\`, buttonText: { displayText: "*Video File* 720p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 1080\`, buttonText: { displayText: "*Video File* 1080p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 144\`, buttonText: { displayText: "*Document File* 144p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 360\`, buttonText: { displayText: "*Document File* 360p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 480\`, buttonText: { displayText: "*Document File* 480p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 720\`, buttonText: { displayText: "*Document File* 720p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 1080\`, buttonText: { displayText: "*Document File* 1080p" }, type: 1 }
        ];

        const payload = {
            image: { url: info.thumbnail },
            caption: captionText,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.error(err);
        reply(\`\${err.message || err}\`);
    }
});

cmd({
    pattern: "video",
    desc: "To download videos.",
    react: "🎥",
    category: "download",
    use: ".video alone part 2",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please give me a URL or title.");

        const cleanUrl = normalizeYtUrl(q);
        const searchRes = await yts(cleanUrl);
        const info = searchRes.videos[0];
        const videoUrl = info.url;

        const captionText = configExtra.VIDEO
            ? configExtra.VIDEO(info, pushname, backtick)
            : \`\n\${configExtra.SIGNATURE(config)}\n> 𝙷𝚎𝚕𝚕𝚘 𝚃𝚑𝚎𝚛𝚎 *\${pushname}*\n> ==========================\n> \${backtick}[  V  I  D  E  O    D  L  ]\${backtick}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> 🎶 *Title:* \${info.title}\n> ⏱️ *Duration:* \${info.timestamp}\n> 👁️ *Views:* \${info.views}\n> 📅 *Uploaded On:* \${info.ago}\n> 🔗 *Link:* \${info.url}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> ==========================\`;

        const buttons = [
            { buttonId: prefix + \`yt2s \${videoUrl} & 144\`, buttonText: { displayText: "*Video File* 144p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 360\`, buttonText: { displayText: "*Video File* 360p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 480\`, buttonText: { displayText: "*Video File* 480p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 720\`, buttonText: { displayText: "*Video File* 720p" }, type: 1 },
            { buttonId: prefix + \`yt2s \${videoUrl} & 1080\`, buttonText: { displayText: "*Video File* 1080p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 144\`, buttonText: { displayText: "*Document File* 144p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 360\`, buttonText: { displayText: "*Document File* 360p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 480\`, buttonText: { displayText: "*Document File* 480p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 720\`, buttonText: { displayText: "*Document File* 720p" }, type: 1 },
            { buttonId: prefix + \`yt3s \${videoUrl} & 1080\`, buttonText: { displayText: "*Document File* 1080p" }, type: 1 }
        ];

        const payload = {
            image: { url: info.thumbnail },
            caption: captionText,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.error(err);
        reply(\`\${err.message || err}\`);
    }
});

cmd({
    pattern: "yt2s",
    desc: "To download songs.",
    dontAddCommandList: true,
    filename: __filename
}, async (conn, mek, m, { from, q, reply, config }) => {
    let dl = null;
    try {
        if (!q) return reply("Please provide a YouTube link or query.");
        const parts = q.split(" & ");
        const targetUrl = parts[0];
        const quality = parts[1] || "360p";

        const searchRes = await yts(targetUrl);
        const info = searchRes.videos[0];
        const videoUrl = info.url;

        m.react("⬇️");
        dl = await convertYtMedia(videoUrl, "128", quality, "mp4");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Video download failed.");

        const captionText = configExtra.YTMP4
            ? configExtra.YTMP4(info)
            : \`\n\${configExtra.SIGNATURE(config)}\n> ==========================\n> ➥ *Title:* \${info.title}\n> ➥ *Duration:* \${info.timestamp}\n> ➥ *Uploaded On:* \${info.ago}\n> ➥ *Link:* \${info.url}\n> ==========================\`;

        m.react("⬆️");
        await conn.sendMessage(from, {
            video: { url: dl.filePath },
            mimetype: "video/mp4",
            caption: captionText,
            fileName: "video.mp4"
        });
        m.react("✅");
    } catch (err) {
        console.log(err);
        reply(\`Failed to download or send video. Error: \${err.message || err}\`);
    } finally {
        if (dl && dl.filePath && fs.existsSync(dl.filePath)) {
            try { fs.unlinkSync(dl.filePath); } catch (_) {}
        }
    }
});

cmd({
    pattern: "yt3s",
    desc: "To download songs.",
    dontAddCommandList: true,
    filename: __filename
}, async (conn, mek, m, { from, q, reply, getThumbnailBuffer, config }) => {
    let dl = null;
    try {
        if (!q) return reply("Please provide a YouTube link or query.");
        const parts = q.split(" & ");
        const targetUrl = parts[0];
        const quality = parts[1] || "360p";

        const searchRes = await yts(targetUrl);
        const info = searchRes.videos[0];
        const videoUrl = info.url;

        const thumbBuf = await getThumbnailBuffer(info.thumbnail);
        m.react("⬇️");

        dl = await convertYtMedia(videoUrl, "128", quality, "mp4");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Video document download failed.");

        const captionText = configExtra.YTMP4
            ? configExtra.YTMP4(info)
            : \`\n\${configExtra.SIGNATURE(config)}\n> ==========================\n> ➥ *Title:* \${info.title}\n> ➥ *Duration:* \${info.timestamp}\n> ➥ *Uploaded On:* \${info.ago}\n> ➥ *Link:* \${info.url}\n> ==========================\`;

        m.react("⬆️");
        await conn.sendMessage(from, {
            document: { url: dl.filePath },
            mimetype: "video/mp4",
            fileName: \`\${info.title}.mp4\`,
            caption: captionText,
            jpegThumbnail: thumbBuf
        });
        m.react("✅");
    } catch (err) {
        console.log(err);
        reply(\`Failed to download or send video. Error: \${err.message || err}\`);
    } finally {
        if (dl && dl.filePath && fs.existsSync(dl.filePath)) {
            try { fs.unlinkSync(dl.filePath); } catch (_) {}
        }
    }
});

cmd({
    pattern: "csong",
    desc: "To download songs.",
    react: "🎵",
    category: "download",
    use: ".yts numba ha",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    try {
        const prefix = config.PREFIX;
        if (!q) return reply("Please provide a search query & newsletterJid");

        const parts = q.split(" & ");
        const queryStr = parts[0];
        const jidStr = parts[1];

        const searchRes = await yts(queryStr);
        const videos = searchRes.videos.slice(0, 10);
        if (!videos.length) return reply("No Songs found.");

        const buttons = videos.map((item, idx) => ({
            buttonId: \`\${prefix}csongdl \${item.url} & \${jidStr}\`,
            buttonText: { displayText: \`*\${idx + 1}. \${item.title}*\` },
            type: 1
        }));

        const imgUrl = configExtra.IMG;
        const payload = {
            image: { url: imgUrl },
            caption: \`\n\${configExtra.SIGNATURE(config)}\n> \${backtick}*HELLO THERE \${pushname}*\${backtick}\`,
            footer: config.FOOTER,
            buttons: buttons,
            headerType: 4
        };

        return await conn.nonbuttonMessage(from, payload);
    } catch (err) {
        console.log(err);
        reply(\`Error: \${err.message || err}\`);
    }
});

cmd({
    pattern: "csongdl",
    desc: "To download songs.",
    use: ".song lelena",
    filename: __filename
}, async (conn, mek, m, { from, q, reply, pushname, config }) => {
    let dl = null;
    try {
        if (!q) return reply("Please give me a URL or title.");

        const parts = q.split(" & ");
        const targetUrl = normalizeYtUrl(parts[0]);
        const jidStr = parts[1];

        m.react("⬇️");
        const searchRes = await yts(targetUrl);
        const info = searchRes.videos[0];

        const captionText = configExtra.SONG
            ? configExtra.SONG(info, pushname)
            : \`\n\${configExtra.SIGNATURE(config)}\n> 𝙷𝚎𝚕𝚕𝚘 𝚃𝚑𝚎𝚛𝚎 *\${pushname}*\n> ==========================\n> \${backtick}[  S  O  N  G    D  L  ]\${backtick}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> 🎶 *Title:* \${info.title}\n> ⏱️ *Duration:* \${info.timestamp}\n> 👁️ *Views:* \${info.views}\n> 📅 *Uploaded On:* \${info.ago}\n> 🔗 *Link:* \${info.url}\n> >>>>>>>>>>>>>>>>>>>>>>>>>>\n> ==========================\`;

        dl = await convertYtMedia(info.url, "128", "480", "mp3");
        if (!dl || !dl.filePath || !fs.existsSync(dl.filePath)) throw new Error("Audio download failed.");

        m.react("⬆️");
        await conn.sendMessage(\`\${jidStr}\`, { image: { url: info.thumbnail }, caption: captionText });
        await conn.sendMessage(\`\${jidStr}\`, { audio: { url: dl.filePath }, mimetype: "audio/mpeg", fileName: dl.filename, ptt: true });
        m.react("✅");
    } catch (err) {
        console.error(err);
        reply(\`\${err}\`);
    } finally {
        if (dl && dl.filePath && fs.existsSync(dl.filePath)) {
            try { fs.unlinkSync(dl.filePath); } catch (_) {}
        }
    }
});
`;

fs.writeFileSync(path.join(__dirname, 'clean_disk_yt.js'), updatedYoutubeCode);
console.log('clean_disk_yt.js generated!');
