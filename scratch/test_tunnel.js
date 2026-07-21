const fetch = require('node-fetch');
const fs = require('fs');

async function testTunnel() {
    try {
        const gVWoc = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            "Referer": "https://frame.y2meta-uk.com/",
            "Origin": "https://frame.y2meta-uk.com",
            "Accept": "*/*"
        };

        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: gVWoc });
        const { key } = await keyRes.json();

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
                ...gVWoc,
                "Content-Type": "application/x-www-form-urlencoded",
                key: key
            },
            body: params
        });

        const json = await convRes.json();
        console.log('Converter JSON:', json);

        if (!json.url) return;

        // Try fetching without custom headers first
        console.log('Fetching file with default fetch...');
        const dl1 = await fetch(json.url);
        console.log('Response 1 status:', dl1.status);
        const buf1 = await dl1.buffer();
        console.log('Buffer 1 size:', buf1.length);

        // Try fetching with gVWoc headers
        console.log('Fetching file with gVWoc headers...');
        const dl2 = await fetch(json.url, { headers: gVWoc });
        console.log('Response 2 status:', dl2.status);
        const buf2 = await dl2.buffer();
        console.log('Buffer 2 size:', buf2.length);

        if (buf1.length > 0) {
            fs.writeFileSync('test_rick.mp4', buf1);
            console.log('Saved test_rick.mp4!');
        }
    } catch(e) {
        console.error('Error:', e);
    }
}

testTunnel();
