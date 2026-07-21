const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ruhend = require('ruhend-scraper');
const dylux = require('api-dylux');

const gVWoc = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

const ytUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

async function checkCnv() {
    try {
        console.log('--- Checking cnv.cx ---');
        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: gVWoc });
        const { key } = await keyRes.json();

        const params = new URLSearchParams({
            link: ytUrl,
            format: "mp4",
            audioBitrate: "128",
            videoQuality: "360",
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

        const json = await convRes.json();
        console.log('cnv.cx response:', json);
        if (json.url) {
            const dlRes = await fetch(json.url, { headers: gVWoc });
            const buf = await dlRes.buffer();
            const outPath = path.join(__dirname, 'cnv_test.mp4');
            fs.writeFileSync(outPath, buf);
            console.log(`Saved cnv_test.mp4 (${buf.length} bytes)`);
            probeFile(outPath);
        }
    } catch(e) {
        console.error('cnv error:', e.message);
    }
}

async function checkRuhend() {
    try {
        console.log('--- Checking ruhend.ytmp4 ---');
        const res = await ruhend.ytmp4(ytUrl);
        console.log('ruhend response:', res);
        if (res && (res.video || res.dl_url || res.url)) {
            const videoUrl = res.video || res.dl_url || res.url;
            const dlRes = await fetch(videoUrl);
            const buf = await dlRes.buffer();
            const outPath = path.join(__dirname, 'ruhend_test.mp4');
            fs.writeFileSync(outPath, buf);
            console.log(`Saved ruhend_test.mp4 (${buf.length} bytes)`);
            probeFile(outPath);
        }
    } catch(e) {
        console.error('ruhend error:', e.message);
    }
}

async function checkDylux() {
    try {
        console.log('--- Checking dylux.ytv ---');
        const res = await dylux.ytv(ytUrl);
        console.log('dylux response:', res);
        if (res && res.dl_url) {
            const dlRes = await fetch(res.dl_url);
            const buf = await dlRes.buffer();
            const outPath = path.join(__dirname, 'dylux_test.mp4');
            fs.writeFileSync(outPath, buf);
            console.log(`Saved dylux_test.mp4 (${buf.length} bytes)`);
            probeFile(outPath);
        }
    } catch(e) {
        console.error('dylux error:', e.message);
    }
}

function probeFile(filePath) {
    try {
        const out = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height -show_entries format=format_name -of json "${filePath}"`).toString();
        console.log(`ffprobe video for ${path.basename(filePath)}:`, out.replace(/\s+/g, ' '));

        const outAudio = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of json "${filePath}"`).toString();
        console.log(`ffprobe audio for ${path.basename(filePath)}:`, outAudio.replace(/\s+/g, ' '));
    } catch(e) {
        console.error('ffprobe error:', e.message);
    }
}

async function main() {
    await checkCnv();
    await checkRuhend();
    await checkDylux();
}

main();
