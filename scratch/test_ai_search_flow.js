const { handleAiSearchCommand } = require('../src/commands/ai_search');

// Mock Baileys Socket for testing
const mockSock = {
    async sendMessage(chatId, content, opts) {
        console.log(`\n📲 [MOCK WHATSAPP SEND to ${chatId}]:`);
        if (content.text) console.log(`   Text: ${content.text}`);
        if (content.caption) console.log(`   Caption: ${content.caption}`);
        if (content.image) console.log(`   Image URL: ${content.image.url}`);
        if (content.video) console.log(`   Video URL: ${content.video.url}`);
    }
};

const mockMsg = {
    key: { remoteJid: '123456789@s.whatsapp.net', participant: '123456789@s.whatsapp.net' }
};

async function main() {
    console.log("🚀 Starting End-to-End AI Search Flow Test for 'Superman 2025 in 720p'...");
    await handleAiSearchCommand(mockSock, mockMsg, ["Superman", "2025", "720p"]);
}

main();
