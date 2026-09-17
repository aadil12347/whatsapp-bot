const fs = require('fs');
const {
    loadInactiveData,
    saveInactiveData,
    lockTargetGroup,
    markUserActive,
    getInactiveMembers,
    removeKickedUsers,
    initGroupTracker
} = require('../src/Utils/inactive_tracker');

const {
    handleResetTracker,
    handleNonActiveList,
    handleKickNonActive,
    handleDownloadInactiveList
} = require('../src/commands/inactive_cmd');

console.log('🧪 Starting Inactive Tracker (Group + DM execution) Unit Test...');

const targetGroupId = '120363000000000000@g.us';
const privateDmJid = '923009999999@s.whatsapp.net';
const initialMembers = [
    '923001111111@s.whatsapp.net',
    '923002222222@s.whatsapp.net'
];

// 1. Lock to target group & seed data
lockTargetGroup(targetGroupId);
const data = loadInactiveData();
data[targetGroupId] = {
    groupName: 'Daniewatch Group',
    lastReset: Date.now(),
    inactiveMembers: [...initialMembers]
};
saveInactiveData(data);
console.log('✅ Target group locked & seeded.');

// 2. Test getInactiveMembers when called from DM
const dmFetch = getInactiveMembers(privateDmJid);
if (!dmFetch || dmFetch.inactiveMembers.length !== 2) {
    throw new Error('DM fetch failed to return target group data!');
}
if (dmFetch.targetGroupJid !== targetGroupId) {
    throw new Error('DM fetch did not return targetGroupJid!');
}
console.log('✅ DM fetch returns Daniewatch group tracking data.');

// 3. Test handleNonActiveList from DM
let sentText = '';
let sentMentions = [];
const mockConn = {
    sendMessage: async (jid, payload) => {
        sentText = payload.text || '';
        sentMentions = payload.mentions || [];
        return { key: { id: 'test_msg_id' } };
    },
    groupParticipantsUpdate: async (groupJid, participants, action) => {
        console.log(`Mock: update group ${groupJid} participants ${participants} -> ${action}`);
        if (groupJid !== targetGroupId) {
            throw new Error(`Kick was attempted on ${groupJid} instead of target group ${targetGroupId}`);
        }
    }
};

const mockReply = async (msg) => {
    sentText = msg;
};

async function runTests() {
    // 3a. handleNonActiveList from DM
    await handleNonActiveList(mockConn, privateDmJid, mockReply);
    if (!sentText.includes('DANIEWATCH GROUP INACTIVE MEMBERS LIST')) {
        throw new Error('handleNonActiveList in DM failed to generate proper response');
    }
    console.log('✅ handleNonActiveList executed from DM successfully.');

    // 3b. handleKickNonActive from DM (kick 1 member)
    await handleKickNonActive(mockConn, privateDmJid, ['1'], mockReply);
    const postKickFetch = getInactiveMembers(privateDmJid);
    if (postKickFetch.inactiveMembers.length !== 1) {
        throw new Error('handleKickNonActive from DM failed to remove kicked user!');
    }
    console.log('✅ handleKickNonActive executed from DM and updated target group successfully.');

    // Clean up test data
    const finalData = loadInactiveData();
    delete finalData[targetGroupId];
    delete finalData.targetGroupJid;
    saveInactiveData(finalData);

    console.log('🎉 All Inactive Tracker DM + Group unit tests passed successfully!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
