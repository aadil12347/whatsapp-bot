const { cleanJid, isOwner } = (function() {
    function cleanJid(jid) {
        if (!jid || typeof jid !== 'string') return '';
        const parts = jid.split('@');
        const user = parts[0].split(':')[0];
        let server = parts[1] || 's.whatsapp.net';
        if (server === 'c.us') server = 's.whatsapp.net';
        return `${user}@${server}`;
    }
    
    const sudoList = ['923013068663', '94717775628'];
    function isOwner(jid) {
        if (!jid) return false;
        const num = cleanJid(jid).split('@')[0];
        return sudoList.includes(num);
    }

    return { cleanJid, isOwner };
})();

function testYouChatCheck(from, senderJid, fromMe, botId) {
    const isGroupChat = !!(from && from.endsWith('@g.us'));
    const cleanSender = cleanJid(senderJid);
    const isOwnerSender = !!(fromMe || isOwner(senderJid));

    const cleanFromJid = cleanJid(from);
    const botUserJid = cleanJid(botId);

    const isSelfChat = !!(
        cleanFromJid &&
        (
            cleanFromJid === cleanSender ||
            (botUserJid && cleanFromJid === botUserJid) ||
            isOwner(cleanFromJid)
        )
    );

    const isYouChat = !isGroupChat && isOwnerSender && isSelfChat;
    return isYouChat;
}

const botId = '94717775628:4@s.whatsapp.net';

console.log('Test 1: Admin in "You" (self) chat:');
console.log('Result:', testYouChatCheck('94717775628@s.whatsapp.net', '94717775628@s.whatsapp.net', true, botId), 'Expected: true');

console.log('\nTest 2: Admin in Friend John DM (friend@s.whatsapp.net):');
console.log('Result:', testYouChatCheck('923001112222@s.whatsapp.net', '94717775628@s.whatsapp.net', true, botId), 'Expected: false');

console.log('\nTest 3: Admin in Group chat (group@g.us):');
console.log('Result:', testYouChatCheck('12036399999@g.us', '94717775628@s.whatsapp.net', true, botId), 'Expected: false');

console.log('\nTest 4: Sudo Owner messaging Bot DM:');
console.log('Result:', testYouChatCheck('94717775628@s.whatsapp.net', '923013068663@s.whatsapp.net', false, botId), 'Expected: true');

console.log('\nTest 5: Sudo Owner messaging Customer C on Sudo phone:');
console.log('Result:', testYouChatCheck('923999999999@s.whatsapp.net', '923013068663@s.whatsapp.net', true, botId), 'Expected: false');
