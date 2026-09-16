require('dotenv').config({ path: './config.env' });
const axios = require('axios');
const FormData = require('form-data');
const { extractSearchIntent } = require('../src/Utils/ai_provider');

async function testPosterOcrPipeline() {
    console.log("=== Testing Poster OCR + Groq Intent Extraction Pipeline ===");

    // Base64 or sample poster URL
    const posterUrl = "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg"; // M3GAN / Pulp Fiction

    try {
        const form = new FormData();
        form.append('url', posterUrl);
        form.append('apikey', 'helloworld');
        form.append('language', 'eng');

        const res = await axios.post('https://api.ocr.space/parse/image', form, {
            headers: form.getHeaders(),
            timeout: 15000
        });

        if (res.data && res.data.ParsedResults && res.data.ParsedResults[0]) {
            const rawOcrText = res.data.ParsedResults[0].ParsedText || '';
            console.log(`[OCR] Raw Text extracted from poster: "${rawOcrText.trim().replace(/\n/g, ' ')}"`);

            const intent = await extractSearchIntent(rawOcrText);
            console.log("\n[Groq AI] Normalized Intent from Poster OCR:", intent);
            console.log(`\n✅ Recognized Official Movie Title: "${intent.query}"`);
        }
    } catch (err) {
        console.error("❌ Pipeline error:", err.message);
    }
}

testPosterOcrPipeline();
