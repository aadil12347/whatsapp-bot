const axios = require('axios');
const FormData = require('form-data');

async function testOcrSpace() {
    console.log("=== Testing OCR.Space Free API for Poster Image Text Extraction ===");
    try {
        // 1x1 base64 or sample test image
        const sampleUrl = "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg"; // M3GAN poster
        const form = new FormData();
        form.append('url', sampleUrl);
        form.append('apikey', 'helloworld');
        form.append('language', 'eng');
        form.append('isOverlayRequired', 'false');

        const res = await axios.post('https://api.ocr.space/parse/image', form, {
            headers: form.getHeaders(),
            timeout: 15000
        });

        console.log("OCR.space Response:", res.data);
        if (res.data && res.data.ParsedResults && res.data.ParsedResults[0]) {
            const extractedText = res.data.ParsedResults[0].ParsedText;
            console.log("\n✅ Extracted OCR Text from Poster:", extractedText);
        }
    } catch (err) {
        console.error("❌ OCR.space error:", err.message);
    }
}

testOcrSpace();
