const { extractSearchIntent } = require('../src/Utils/ai_provider');

async function testPhonetic() {
    console.log("🧪 Testing Spoken Phonetic Correction (e.g., 'streetoo')...");

    const r1 = await extractSearchIntent("streetoo in 720p");
    console.log("R1 ('streetoo'):", r1);

    const r2 = await extractSearchIntent("pushpa tu series");
    console.log("R2 ('pushpa tu'):", r2);

    const r3 = await extractSearchIntent("batman v super man 1080p");
    console.log("R3 ('batman v super man'):", r3);
}

testPhonetic();
