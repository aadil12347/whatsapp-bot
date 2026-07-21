const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const gVWoc = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

function remuxToFaststartMp4(inputBuffer) {
    if (!inputBuffer || inputBuffer.length === 0) return inputBuffer;
    const tmpInput = path.join(os.tmpdir(), `yt_in_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp4`);
    const tmpOutput = path.join(os.tmpdir(), `yt_out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp4`);
    try {
        fs.writeFileSync(tmpInput, inputBuffer);
        execSync(`ffmpeg -y -i "${tmpInput}" -c copy -movflags +faststart "${tmpOutput}"`, { stdio: 'ignore' });
        const outputBuffer = fs.readFileSync(tmpOutput);
        console.log(`[Remux] Faststart applied! Original: ${inputBuffer.length} bytes -> Fixed: ${outputBuffer.length} bytes`);
        return outputBuffer;
    } catch(e) {
        console.error('[Remux] Faststart remux failed, returning original buffer:', e.message);
        return inputBuffer;
    } finally {
        try { if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput); } catch(_) {}
        try { if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch(_) {}
    }
}

async function downloadYt(url, format = 'mp4', quality = '360p') {
    try {
        console.log("Fetching key...");
        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: gVWoc });
        if (!keyRes.ok) throw new Error("Key fetch failed");
        const { key } = await keyRes.json();

        console.log("Getting download link...");
        const params = new URLSearchParams({
            link: url,
            format: format,
            audioBitrate: "128",
            videoQuality: quality,
            filenameStyle: "pretty",
            vCodec: "h264"
        });

        const convRes = await fetch("https://cnv.cx/v2/converter", {
            method: "POST",
            headers: {
                ...gVWoc,
                "Content-Type": "application/x-www-form-urlencoded",
                key: key
            },
            body: params
        });

        if (!convRes.ok) throw new Error("Conversion failed");
        const json = await convRes.json();
        if (!json.url) throw new Error("No download URL found");

        console.log("Downloading file buffer...");
        const dlRes = await fetch(json.url, { headers: gVWoc });
        if (!dlRes.ok) throw new Error("File download failed");
        const arrBuf = await dlRes.arrayBuffer();
        let buffer = Buffer.from(arrBuf);

        let mimetype = "audio/mpeg";
        if (format === 'mp4') {
            mimetype = "video/mp4";
            console.log("Remuxing fMP4 to standard faststart MP4...");
            buffer = remuxToFaststartMp4(buffer);
        }

        return { buffer, filename: json.filename, mimetype };
    } catch(e) {
        console.error("Download error:", e.message);
        return null;
    }
}

async function main() {
    const res = await downloadYt("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "mp4", "360");
    if (res && res.buffer) {
        console.log(`Success! Filename: ${res.filename}, Mime: ${res.mimetype}, Buffer size: ${res.buffer.length}`);
        
        // Probe atoms of resulting buffer
        const outPath = path.join(__dirname, 'final_fixed.mp4');
        fs.writeFileSync(outPath, res.buffer);
        const atoms = execSync(`ffprobe -v trace "${outPath}" 2>&1 | findstr /i "type:'moov' type:'mdat'"`).toString();
        console.log('Final atom structure:\n', atoms.substring(0, 500));
    }
}

main();
