const { formatPreConfirmCard, handlePreConfirmationReply, pendingPreConfirmations } = require('../src/commands/ai_search');

async function testCardAndReplies() {
    console.log("=== Testing Pre-Confirmation Card Formatting ===");
    const mockPost = {
        title: "Download When Life Gives You Tangerines (2025) Season 1 Multi Audio {Hindi-English-Korean} NetFlix Series 480p | 720p | 1080p WEB-DL",
        link: "https://example.com/post1"
    };

    const mockIntent = {
        query: "When Life Gives You Tangerines",
        year: "2025",
        resolution: "720p",
        type: "series",
        season: 1,
        episode: null
    };

    const availableSeasons = [1];
    const cardText = formatPreConfirmCard(mockPost, mockIntent, availableSeasons);
    console.log("Formatted Card:\n" + cardText);

    if (cardText.includes("1️⃣") || cardText.includes("2️⃣") || cardText.includes("Quote/Reply with yes")) {
        console.error("❌ Test Failed: Card text still contains instructions at the end!");
    } else {
        console.log("✅ Test Passed: Card is clean, instruction-free, and correctly formatted!");
    }

    console.log("\n=== Testing Multi-Episode Reply Parsing ===");
    const confirmKey = "test_chat_1234";
    pendingPreConfirmations.set(confirmKey, {
        chatId: "test_chat",
        sender: "test_user",
        post: mockPost,
        intent: mockIntent,
        candidates: [mockPost],
        availableSeasons: [1],
        messageId: "msg123",
        timestamp: Date.now()
    });

    const mockSock = {
        sendMessage: async (jid, content) => {
            console.log(`[Mock Sock] Message to ${jid}:`, content.text || content.caption || content);
            return { key: { id: 'reply123' } };
        }
    };

    const mockMsg = {
        key: { remoteJid: "test_chat", participant: "test_user" }
    };

    // Test text reply with multi-episode list e.g. "3, 4, 5, 6"
    console.log("Testing text reply: 'episode 3, 4, 5, 6'");
    await handlePreConfirmationReply(mockSock, mockMsg, confirmKey, null, "episode 3, 4, 5, 6");
    
    const updatedSession = pendingPreConfirmations.get(confirmKey);
    console.log("Updated Intent Episodes:", mockIntent.selectedEpisodes);

    if (mockIntent.selectedEpisodes && mockIntent.selectedEpisodes.join(',') === '3,4,5,6') {
        console.log("✅ Test Passed: Multi-episode list parsed successfully as [3, 4, 5, 6]!");
    } else {
        console.error("❌ Test Failed: Multi-episode list parsing failed!");
    }
}

testCardAndReplies().catch(console.error);
