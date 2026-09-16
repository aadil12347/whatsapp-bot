require('dotenv').config({ path: './config.env' });
const { extractSearchIntent, verifyPosterWithUserTitle } = require('../src/Utils/ai_provider');

async function testIntentExtraction() {
    console.log("=== Testing Search Intent Extraction for Sequels & Poster Logic ===");

    const input = "megan 2.0";
    console.log(`Input Prompt: "${input}"`);
    const intent = await extractSearchIntent(input);
    console.log("Extracted Intent:", intent);

    if (intent.query.includes("2.0") || intent.query.includes("M3GAN")) {
        console.log("✅ Success: Sequel number preserved in intent query!");
    } else {
        console.error("❌ Failed: Sequel number was stripped!");
    }
}

testIntentExtraction();
