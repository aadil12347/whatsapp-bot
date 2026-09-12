const { extractSearchIntent } = require('../src/Utils/ai_provider');

async function test() {
    console.log("🧪 Testing extractSearchIntent...");
    const result1 = await extractSearchIntent("Superman 2025 in 720p");
    console.log("Result 1:", result1);

    const result2 = await extractSearchIntent("download stranger things season 4 1080p series");
    console.log("Result 2:", result2);
}

test();
