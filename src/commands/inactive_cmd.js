const {
    initGroupTracker,
    getInactiveMembers,
    removeKickedUsers
} = require('../Utils/inactive_tracker');

/**
 * Delay helper for safe batch kicks
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formats a JID into a readable phone number (+92 300 1234567)
 */
function formatJidToPhone(jid) {
    if (!jid) return '';
    const num = jid.split('@')[0].split(':')[0];
    return `+${num}`;
}

/**
 * Handles the .resettracker command to initialize group member tracking for Daniewatch group
 */
async function handleResetTracker(conn, from, reply) {
    if (!from || !from.endsWith('@g.us')) {
        return reply('❌ This command can only be used inside a WhatsApp Group.');
    }

    try {
        await reply('🔄 Initializing member activity tracker for Daniewatch Group...');
        const result = await initGroupTracker(conn, from);
        
        if (!result) {
            return reply('❌ Failed to initialize group tracker.');
        }

        return reply(
            `✅ *Daniewatch Group Tracker Initialized!*\n\n` +
            `👥 Group: *${result.groupName}*\n` +
            `👥 Total Group Members: *${result.totalMembers}*\n` +
            `📊 Regular Members Tracked (Admins Excluded): *${result.trackedInactive}*\n\n` +
            `🔒 *Permanently locked to this Daniewatch group.*\n\n` +
            `*How it works:*\n` +
            `• When members read group messages or react with emojis, they are automatically marked active.\n` +
            `• Type *.nonactive* anytime to view remaining inactive members.\n` +
            `• Type *.listinactive* to download a TXT file of all inactive members with phone numbers.\n` +
            `• Type *.kicknonactive <amount>* to remove them safely.`
        );
    } catch (err) {
        console.error('[InactiveCmd] resettracker error:', err.message);
        return reply(`❌ ${err.message}`);
    }
}

/**
 * Handles the .nonactive command to list inactive group members
 */
async function handleNonActiveList(conn, from, reply) {
    if (!from || !from.endsWith('@g.us')) {
        return reply('❌ This command can only be used inside a WhatsApp Group.');
    }

    const trackerData = getInactiveMembers(from);
    if (trackerData && trackerData.locked) {
        return reply(`⚠️ Inactive tracker is configured permanently for *${trackerData.targetGroupName}* only.`);
    }

    if (!trackerData) {
        return reply(
            `⚠️ *Daniewatch Group tracker is not active for this group yet.*\n\n` +
            `Please run *.resettracker* inside your Daniewatch group to start tracking activity!`
        );
    }

    const list = trackerData.inactiveMembers || [];
    if (list.length === 0) {
        return reply('🎉 *All tracked members in Daniewatch group are active!* (No inactive members found)');
    }

    let text = `📊 *DANIEWATCH GROUP INACTIVE MEMBERS LIST*\n\n`;
    text += `Group Name: *${trackerData.groupName || 'Daniewatch'}*\n`;
    text += `Total Inactive Members: *${list.length}*\n`;
    text += `Last Reset: *${new Date(trackerData.lastReset).toLocaleString()}*\n\n`;
    text += `*Member List Preview:*\n`;

    // Limit displayed list preview to top 50 to avoid hitting WhatsApp text length limits
    const displayList = list.slice(0, 50);
    displayList.forEach((jid, idx) => {
        text += `${idx + 1}. @${jid.split('@')[0]}\n`;
    });

    if (list.length > 50) {
        text += `\n...and *${list.length - 50}* more members.`;
    }

    text += `\n\n💡 *Action Commands:*\n`;
    text += `• *.listinactive* (Download full TXT file with phone numbers)\n`;
    text += `• *.kicknonactive 5* (Kicks top 5 inactive members with 5-10s random delays)\n`;
    text += `• *.kicknonactive 20* (Kicks top 20 inactive members)\n`;
    text += `• *.resettracker* (Resets tracking data)`;

    return conn.sendMessage(from, { text, mentions: displayList });
}

/**
 * Handles the .kicknonactive command to kick specified number of inactive members
 */
async function handleKickNonActive(conn, from, args, reply) {
    if (!from || !from.endsWith('@g.us')) {
        return reply('❌ This command can only be used inside a WhatsApp Group.');
    }

    const trackerData = getInactiveMembers(from);
    if (trackerData && trackerData.locked) {
        return reply(`⚠️ Inactive tracker is configured permanently for *${trackerData.targetGroupName}* only.`);
    }

    const amountInput = parseInt(args[0] || '1', 10);
    if (isNaN(amountInput) || amountInput <= 0) {
        return reply('⚠️ Please specify a valid positive number. Example: *.kicknonactive 5*');
    }

    if (!trackerData || !Array.isArray(trackerData.inactiveMembers) || trackerData.inactiveMembers.length === 0) {
        return reply('❌ No inactive members found to kick. Run *.nonactive* or *.resettracker* first.');
    }

    const targetJids = trackerData.inactiveMembers.slice(0, amountInput);
    const totalToKick = targetJids.length;

    await reply(`⏳ *Starting safe cleanup of ${totalToKick} inactive member(s) from Daniewatch Group...*\nEach member will be removed one-by-one with a random 5–10 second delay.`);

    const kickedSuccessfully = [];
    const failedKicks = [];

    for (let i = 0; i < targetJids.length; i++) {
        const jid = targetJids[i];
        try {
            console.log(`[InactiveCmd] Kicking inactive member ${i + 1}/${totalToKick}: ${jid}`);
            await conn.groupParticipantsUpdate(from, [jid], 'remove');
            kickedSuccessfully.push(jid);
        } catch (err) {
            console.error(`[InactiveCmd] Failed to kick ${jid}:`, err.message);
            failedKicks.push(jid);
        }

        // Random delay between 5000ms and 10000ms (5 to 10 seconds)
        if (i < targetJids.length - 1) {
            const randomDelay = Math.floor(Math.random() * 5000) + 5000;
            console.log(`[InactiveCmd] Delaying ${randomDelay / 1000}s before next removal...`);
            await sleep(randomDelay);
        }
    }

    // Update tracking data to remove successfully kicked members
    if (kickedSuccessfully.length > 0) {
        removeKickedUsers(from, kickedSuccessfully);
    }

    let summaryText = `✅ *Cleanup Complete!*\n\n`;
    summaryText += `🟢 Successfully removed: *${kickedSuccessfully.length}*\n`;
    if (failedKicks.length > 0) {
        summaryText += `❌ Failed removals: *${failedKicks.length}*\n`;
    }
    summaryText += `📊 Remaining inactive members: *${trackerData.inactiveMembers.length - kickedSuccessfully.length}*`;

    return reply(summaryText);
}

/**
 * Handles the .listinactive command to generate and send a downloadable TXT file
 */
async function handleDownloadInactiveList(conn, from, reply, mek) {
    if (!from || !from.endsWith('@g.us')) {
        return reply('❌ This command can only be used inside a WhatsApp Group.');
    }

    const trackerData = getInactiveMembers(from);
    if (trackerData && trackerData.locked) {
        return reply(`⚠️ Inactive tracker is configured permanently for *${trackerData.targetGroupName}* only.`);
    }

    if (!trackerData) {
        return reply('⚠️ Daniewatch group tracker is not active yet. Please run *.resettracker* inside your Daniewatch group first!');
    }

    const list = trackerData.inactiveMembers || [];
    if (list.length === 0) {
        return reply('🎉 All tracked members in Daniewatch group are active! No inactive members to export.');
    }

    let fileContent = `=================================================\n`;
    fileContent += `       DANIEWATCH INACTIVE MEMBERS EXPORT LIST   \n`;
    fileContent += `=================================================\n`;
    fileContent += `Group Name: ${trackerData.groupName || 'Daniewatch'}\n`;
    fileContent += `Group ID: ${from}\n`;
    fileContent += `Total Inactive Members: ${list.length}\n`;
    fileContent += `Export Timestamp: ${new Date().toLocaleString()}\n`;
    fileContent += `=================================================\n\n`;

    list.forEach((jid, idx) => {
        const phone = formatJidToPhone(jid);
        fileContent += `${idx + 1}. ${phone} (${jid})\n`;
    });

    const fileBuffer = Buffer.from(fileContent, 'utf-8');
    const safeGroupName = (trackerData.groupName || 'Daniewatch').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const fileName = `Daniewatch_Inactive_Members_${Date.now()}.txt`;

    try {
        await conn.sendMessage(from, {
            document: fileBuffer,
            fileName: fileName,
            mimetype: 'text/plain',
            caption: `📄 *Daniewatch Inactive Members Export File*\n\n👥 Group: *${trackerData.groupName || 'Daniewatch'}*\n📊 Total Inactive Members: *${list.length}*\n📅 Exported on: ${new Date().toLocaleDateString()}`
        }, { quoted: mek });
    } catch (err) {
        console.error('[InactiveCmd] Download inactive list error:', err.message);
        return reply(`❌ Error sending inactive list file: ${err.message}`);
    }
}

module.exports = {
    handleResetTracker,
    handleNonActiveList,
    handleKickNonActive,
    handleDownloadInactiveList
};
