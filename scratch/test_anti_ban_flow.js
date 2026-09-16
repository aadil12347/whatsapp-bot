const { getRandomDelay, markAsRead, simulateHumanTyping, applyAntiBanPresence } = require('../src/Utils/anti_ban');

async function testAntiBanModule() {
    console.log('--- Testing Anti-Ban Module ---');

    // 1. Test getRandomDelay
    for (let i = 0; i < 10; i++) {
        const delay = getRandomDelay(400, 1500);
        console.log(`Sample ${i + 1} Delay: ${delay}ms`);
        if (delay > 2000) {
            throw new Error(`Delay exceeded 2000ms limit! Got: ${delay}ms`);
        }
        if (delay < 400) {
            throw new Error(`Delay was below 400ms! Got: ${delay}ms`);
        }
    }
    console.log('✅ getRandomDelay test passed (all values within 400ms - 2000ms range).');

    // 2. Test presence updates & read receipts simulation
    let readCalled = false;
    let presenceCalled = false;

    const mockConn = {
        readMessages: async (keys) => {
            readCalled = true;
            console.log('Mock readMessages called for key:', keys[0].id);
        },
        sendPresenceUpdate: async (mode, jid) => {
            presenceCalled = true;
            console.log(`Mock sendPresenceUpdate called: mode=${mode} jid=${jid}`);
        }
    };

    const mockMek = { key: { remoteJid: '12345678@s.whatsapp.net', id: 'MSG123' } };

    const start = Date.now();
    await applyAntiBanPresence(mockConn, mockMek, '12345678@s.whatsapp.net', 'composing');
    const elapsed = Date.now() - start;

    console.log(`Elapsed time for anti-ban presence: ${elapsed}ms`);

    if (!readCalled) throw new Error('markAsRead was not triggered!');
    if (!presenceCalled) throw new Error('sendPresenceUpdate was not triggered!');
    if (elapsed > 2500) throw new Error('Presence delay exceeded maximum limit!');

    console.log('✅ applyAntiBanPresence test passed.');
    console.log('🎉 ALL ANTI-BAN TESTS PASSED SUCCESSFULLY!');
}

testAntiBanModule().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
