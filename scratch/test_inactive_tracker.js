const fs = require('fs');
const {
    loadInactiveData,
    saveInactiveData,
    lockTargetGroup,
    markUserActive,
    getInactiveMembers,
    removeKickedUsers
} = require('../src/Utils/inactive_tracker');

console.log('🧪 Starting Target Group Locking Unit Test...');

const targetGroupId = '120363000000000000@g.us';
const otherGroupId = '987654321000000000@g.us';
const initialMembers = [
    '923001111111@s.whatsapp.net',
    '923002222222@s.whatsapp.net'
];

// 1. Lock to target group & seed data
lockTargetGroup(targetGroupId);
const data = loadInactiveData();
data[targetGroupId] = {
    groupName: 'Daniewatch',
    lastReset: Date.now(),
    inactiveMembers: [...initialMembers]
};
saveInactiveData(data);
console.log('✅ Target group locked & seeded.');

// 2. Verify getInactiveMembers on target group
let current = getInactiveMembers(targetGroupId);
if (!current || current.inactiveMembers.length !== 2) throw new Error('Target group fetch failed');

// 3. Verify getInactiveMembers on OTHER group returns locked state
let other = getInactiveMembers(otherGroupId);
if (!other || !other.locked) throw new Error('Other group was not locked out');
console.log('✅ Lock enforcement on other groups verified.');

// 4. Verify activity in OTHER group is ignored
markUserActive(otherGroupId, '923001111111@s.whatsapp.net', 'reaction');
current = getInactiveMembers(targetGroupId);
if (current.inactiveMembers.length !== 2) throw new Error('Activity from other group affected target group!');
console.log('✅ Activity isolation verified.');

// 5. Verify activity in TARGET group removes inactive member
markUserActive(targetGroupId, '923001111111@s.whatsapp.net', 'reaction');
current = getInactiveMembers(targetGroupId);
if (current.inactiveMembers.length !== 1) throw new Error('Activity in target group failed to remove member');
console.log('✅ Target group activity tracking verified.');

// Clean up
delete data[targetGroupId];
delete data.targetGroupJid;
saveInactiveData(data);

console.log('🎉 Target Group Lock unit test passed successfully!');
