const fetch = require('node-fetch');

const gVWoc = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Referer": "https://frame.y2meta-uk.com/",
    "Origin": "https://frame.y2meta-uk.com",
    "Accept": "*/*"
};

async function testConvert(ytUrl, format = 'mp4', quality = '360') {
    try {
        console.log('Fetching key...');
        const keyRes = await fetch("https://cnv.cx/v2/sanity/key", { headers: gVWoc });
        console.log('Key status:', keyRes.status);
        const { key } = await keyRes.json();
        console.log('Key received:', key);

        const params = new URLSearchParams({
            link: ytUrl,
            format: format,
            audioBitrate: "128",
            videoQuality: quality,
            filenameStyle: "pretty",
            vCodec: "h264"
        });

        console.log('Sending conversion request...');
        const convRes = await fetch("https://cnv.cx/v2/converter", {
            method: "POST",
            headers: {
                ...gVWoc,
                "Content-Type": "application/x-www-form-urlencoded",
                key: key
            },
            body: params
        });

        console.log('Converter status:', convRes.status);
        const json = await convRes.json();
        console.log('Converter JSON response:', json);

        if (json.url) {
            console.log('Fetching file headers from URL:', json.url);
            const headRes = await fetch(json.url, { method: 'HEAD', headers: gVWoc });
            console.log('File headers:', headRes.headers.raw());
        }
    } catch(e) {
        console.error('Error during test:', e);
    }
}

testConvert("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "mp4", "360");
