const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

async function downloadYtToDisk(ytUrl, quality = '360', format = 'mp4') {
    const tempRawPath = path.join(os.tmpdir(), `yt_raw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${format}`);
    const tempFixedPath = path.join(os.tmpdir(), `yt_fixed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${format}`);

    try {
        console.log("[YouTube Disk DL] Fetching key...");
        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: defaultHeaders });
        if (!keyRes.ok) throw new Error("Key fetch failed");
        const { key } = await keyRes.json();

        console.log("[YouTube Disk DL] Getting download link...");
        const bodyParams = new URLSearchParams({
            link: ytUrl,
            format: format,
            audioBitrate: "128",
            videoQuality: quality,
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

        if (!convRes.ok) throw new Error("Conversion request failed");
        const convJson = await convRes.json();
        if (!convJson.url) throw new Error("No download URL found");

        console.log("[YouTube Disk DL] Downloading stream directly to disk file:", tempRawPath);
        const fileRes = await fetch(convJson.url, { headers: defaultHeaders });
        if (!fileRes.ok) throw new Error("File stream download failed");

        // Write directly to file stream on disk
        const fileStream = fs.createWriteStream(tempRawPath);
        await new Promise((resolve, reject) => {
            fileRes.body.pipe(fileStream);
            fileRes.body.on('error', reject);
            fileStream.on('finish', resolve);
        });

        const rawSize = fs.statSync(tempRawPath).size;
        console.log(`[YouTube Disk DL] Saved raw download: ${rawSize} bytes`);

        let mime = format === 'mp4' ? "video/mp4" : "audio/mpeg";

        if (format === 'mp4') {
            console.log("[YouTube Disk DL] Processing MP4 faststart remux on disk...");
            try {
                execSync(`ffmpeg -y -i "${tempRawPath}" -c copy -movflags +faststart "${tempFixedPath}"`, { stdio: 'ignore' });
                if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                    console.log(`[YouTube Disk DL] Remux succeeded: ${fs.statSync(tempFixedPath).size} bytes`);
                    if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
                    return { filePath: tempFixedPath, filename: convJson.filename, mimetype: mime };
                }
            } catch (err) {
                console.error("[YouTube Disk DL] Remux copy failed, falling back to faststart transcode:", err.message);
                try {
                    execSync(`ffmpeg -y -i "${tempRawPath}" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${tempFixedPath}"`, { stdio: 'ignore' });
                    if (fs.existsSync(tempFixedPath) && fs.statSync(tempFixedPath).size > 0) {
                        if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath);
                        return { filePath: tempFixedPath, filename: convJson.filename, mimetype: mime };
                    }
                } catch (transErr) {
                    console.error("[YouTube Disk DL] Transcode failed too, using raw download:", transErr.message);
                }
            }
        }

        return { filePath: tempRawPath, filename: convJson.filename, mimetype: mime };
    } catch (e) {
        console.error("[YouTube Disk DL Error]:", e.message);
        if (fs.existsSync(tempRawPath)) try { fs.unlinkSync(tempRawPath); } catch (_) {}
        if (fs.existsSync(tempFixedPath)) try { fs.unlinkSync(tempFixedPath); } catch (_) {}
        return null;
    }
}

async function main() {
    const res = await downloadYtToDisk("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "360", "mp4");
    if (res) {
        console.log("Success!", res);
        if (fs.existsSync(res.filePath)) {
            console.log("Final file exists on disk with size:", fs.statSync(res.filePath).size);
            // Cleanup test file
            fs.unlinkSync(res.filePath);
        }
    }
}

main();
