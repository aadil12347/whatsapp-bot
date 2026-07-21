const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

async function testVideoDownload() {
    console.log("1. Fetching key...");
    const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: defaultHeaders });
    const { key } = await keyRes.json();

    console.log("2. Requesting 360p video download link...");
    const params = new URLSearchParams({
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        format: "mp4",
        audioBitrate: "128",
        videoQuality: "360",
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
        body: params
    });
    const json = await convRes.json();
    console.log("Converter response:", json);

    if (!json.url) throw new Error("No URL returned!");

    console.log("3. Downloading video file directly to disk...");
    const rawPath = path.join(__dirname, 'raw_dl.mp4');
    const fileRes = await fetch(json.url, { headers: defaultHeaders });
    const arrBuf = await fileRes.arrayBuffer();
    fs.writeFileSync(rawPath, Buffer.from(arrBuf));
    console.log(`Downloaded ${fs.statSync(rawPath).size} bytes to raw_dl.mp4`);

    // Probe raw file
    console.log("\n4. Probing raw_dl.mp4 with ffprobe:");
    try {
        const probeRaw = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,level,pix_fmt,width,height,r_frame_rate -of json "${rawPath}"`).toString();
        console.log("Raw Video Stream:", JSON.parse(probeRaw));
        const probeAudio = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of json "${rawPath}"`).toString();
        console.log("Raw Audio Stream:", JSON.parse(probeAudio));
    } catch(e) {
        console.error("Probe raw failed:", e.message);
    }

    // Test copy remux vs libx264 faststart
    console.log("\n5. Remuxing with copy + faststart...");
    const remuxPath = path.join(__dirname, 'remux_copy.mp4');
    execSync(`ffmpeg -y -i "${rawPath}" -c copy -movflags +faststart "${remuxPath}"`);
    console.log(`Remux copy size: ${fs.statSync(remuxPath).size} bytes`);

    console.log("\n6. Transcoding with libx264 + aac + yuv420p + faststart...");
    const transPath = path.join(__dirname, 'transcode.mp4');
    execSync(`ffmpeg -y -i "${rawPath}" -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart "${transPath}"`);
    console.log(`Transcoded size: ${fs.statSync(transPath).size} bytes`);

    // Check containers
    console.log("\n7. Atoms of copy remux:");
    console.log(execSync(`ffprobe -v trace "${remuxPath}" 2>&1 | findstr /i "type:'moov' type:'mdat'"`).toString().substring(0, 300));
}

testVideoDownload();
