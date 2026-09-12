const { extractSearchIntent } = require('../src/Utils/ai_provider');

async function main() {
    console.log("🧪 Testing AI Intent with Origin Detection...");

    const test1 = await extractSearchIntent("Stree 2 movie");
    console.log("Test 1 (Stree 2):", test1);

    const test2 = await extractSearchIntent("Inception 2010 1080p");
    console.log("Test 2 (Inception):", test2);

    const test3 = await extractSearchIntent("Pushpa 2 in 4k series");
    console.log("Test 3 (Pushpa 2):", test3);
}

main();
