const { handleAiSearchCommand, handlePreConfirmationReply, pendingPreConfirmations } = require('../src/commands/ai_search');

const sentMessages = [];
const mockSock = {
    async sendMessage(chatId, content, opts) {
        console.log(`\n📲 [MOCK WHATSAPP SEND to ${chatId}]:`);
        if (content.text) console.log(`   Text:\n${content.text}`);
        if (content.caption) console.log(`   Caption:\n${content.caption}`);
        if (content.image) console.log(`   Image URL: ${content.image.url}`);
        if (content.video) console.log(`   Video URL: ${content.video.url}`);
        sentMessages.push(content);
    }
};

const mockMsg = {
    key: { remoteJid: '923013068663@s.whatsapp.net', participant: '923013068663@s.whatsapp.net' }
};

async function testScenario1_ApprovedInChat() {
    console.log("\n========================================================");
    console.log("🧪 TEST SCENARIO 1: Indian Content Search + Pre-Confirmation YES -> In-Chat 720p File Delivery");
    console.log("========================================================");

    // Step 1: Initiate search for Indian content "Stree 2"
    await handleAiSearchCommand(mockSock, mockMsg, ["Stree", "2", "720p"]);

    // Find pending pre-confirmation key
    let confirmKey = null;
    for (const [key, session] of pendingPreConfirmations.entries()) {
        if (session.chatId === mockMsg.key.remoteJid) {
            confirmKey = key;
            break;
        }
    }

    console.log(`\n🔑 Pre-confirmation key generated: ${confirmKey}`);
    if (!confirmKey) {
        console.error("❌ Test 1 Failed: Pre-confirmation gate did not generate session key.");
        return;
    }

    // Step 2: Simulate user replying "yes"
    console.log(`\n👤 User replies: "yes"`);
    await handlePreConfirmationReply(mockSock, mockMsg, confirmKey, true);
    console.log("✅ Test Scenario 1 Completed!");
}

async function testScenario2_BrowserLink1080p() {
    console.log("\n========================================================");
    console.log("🧪 TEST SCENARIO 2: Non-Indian Search (Inception 1080p) -> Browser Download Link Branch");
    console.log("========================================================");

    // Step 1: Initiate search for 1080p
    await handleAiSearchCommand(mockSock, mockMsg, ["Inception", "1080p"]);

    let confirmKey = null;
    for (const [key, session] of pendingPreConfirmations.entries()) {
        if (session.chatId === mockMsg.key.remoteJid) {
            confirmKey = key;
            break;
        }
    }

    console.log(`\n🔑 Pre-confirmation key generated: ${confirmKey}`);
    if (!confirmKey) {
        console.error("❌ Test 2 Failed: Pre-confirmation key not found.");
        return;
    }

    // Step 2: Simulate user replying "1"
    console.log(`\n👤 User replies: "1"`);
    await handlePreConfirmationReply(mockSock, mockMsg, confirmKey, true);
    console.log("✅ Test Scenario 2 Completed!");
}

async function testScenario3_Cancellation() {
    console.log("\n========================================================");
    console.log("🧪 TEST SCENARIO 3: User Replies NO -> Request Cancelled");
    console.log("========================================================");

    await handleAiSearchCommand(mockSock, mockMsg, ["Superman", "2025"]);

    let confirmKey = null;
    for (const [key, session] of pendingPreConfirmations.entries()) {
        if (session.chatId === mockMsg.key.remoteJid) {
            confirmKey = key;
            break;
        }
    }

    console.log(`\n👤 User replies: "no"`);
    await handlePreConfirmationReply(mockSock, mockMsg, confirmKey, false);
    console.log("✅ Test Scenario 3 Completed!");
}

async function runAll() {
    await testScenario1_ApprovedInChat();
    await testScenario2_BrowserLink1080p();
    await testScenario3_Cancellation();
}

runAll();
