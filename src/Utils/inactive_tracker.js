const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'inactive_members.json');

/**
 * Ensures data directory exists
 */
function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Loads inactive tracking data from JSON file
 */
function loadInactiveData() {
    ensureDir();
    if (!fs.existsSync(FILE_PATH)) {
        return { targetGroupJid: process.env.TARGET_INACTIVE_GROUP || null };
    }
    try {
        const raw = fs.readFileSync(FILE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (process.env.TARGET_INACTIVE_GROUP) {
            data.targetGroupJid = process.env.TARGET_INACTIVE_GROUP;
        }
        return data;
    } catch (err) {
        console.warn('[InactiveTracker] Failed to parse JSON, returning empty object:', err.message);
        return { targetGroupJid: process.env.TARGET_INACTIVE_GROUP || null };
    }
}

/**
 * Saves tracking data locally
 */
function saveInactiveData(data) {
    ensureDir();
    try {
        fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('[InactiveTracker] Save error:', err.message);
    }
}

/**
 * Syncs the JSON file back to GitHub repository asynchronously
 * Keeps GitHub Actions runner state up to date across container restarts.
 */
function gitPushSync() {
    exec('git add data/inactive_members.json && git commit -m "auto-update: inactive members sync" && git push', 
        { cwd: path.join(__dirname, '..', '..') },
        (error, stdout, stderr) => {
            if (error) {
                return;
            }
            console.log('[InactiveTracker] ☁️ Git auto-push synced data/inactive_members.json to repo.');
        }
    );
}

/**
 * Gets the current target group JID (if locked)
 */
function getTargetGroupJid() {
    const data = loadInactiveData();
    return data.targetGroupJid || null;
}

/**
 * Locks tracking permanently to a specific target group JID
 */
function lockTargetGroup(groupId) {
    const data = loadInactiveData();
    data.targetGroupJid = groupId;
    saveInactiveData(data);
    gitPushSync();
}

/**
 * Initializes tracking for the Daniewatch group by fetching all members and excluding admins & bot
 */
async function initGroupTracker(conn, groupId) {
    if (!groupId || !groupId.endsWith('@g.us')) return null;

    const data = loadInactiveData();

    // Lock permanently to the first group initialized (or configured)
    if (!data.targetGroupJid) {
        data.targetGroupJid = groupId;
    } else if (data.targetGroupJid !== groupId) {
        const lockedName = data[data.targetGroupJid]?.groupName || 'Daniewatch Group';
        throw new Error(`Inactive tracker is permanently locked to *${lockedName}* (${data.targetGroupJid}).`);
    }

    try {
        const metadata = await conn.groupMetadata(groupId);
        const botJid = conn.user?.id ? conn.user.id.split(':')[0] + '@s.whatsapp.net' : '';

        if (!data[groupId]) {
            data[groupId] = {
                groupName: metadata.subject || 'Daniewatch Group',
                lastReset: Date.now(),
                inactiveMembers: []
            };
        }

        const inactiveJids = [];
        for (const participant of metadata.participants) {
            const rawNumber = participant.id.split('@')[0].split(':')[0];
            const jid = `${rawNumber}@s.whatsapp.net`;
            const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
            const isBot = jid === botJid;

            // Exclude Admins and Bot itself
            if (!isAdmin && !isBot) {
                inactiveJids.push(jid);
            }
        }

        data[groupId].groupName = metadata.subject || 'Daniewatch Group';
        data[groupId].lastReset = Date.now();
        data[groupId].inactiveMembers = inactiveJids;

        saveInactiveData(data);
        gitPushSync();

        return {
            groupName: metadata.subject || 'Daniewatch Group',
            totalMembers: metadata.participants.length,
            trackedInactive: inactiveJids.length
        };
    } catch (err) {
        console.error('[InactiveTracker] Failed to init group tracker:', err.message);
        throw err;
    }
}

/**
 * Marks a user active by removing them from the Daniewatch group's inactive list
 */
function markUserActive(groupId, userJid, reason = 'activity') {
    if (!groupId || !userJid || !groupId.endsWith('@g.us')) return;

    const data = loadInactiveData();

    // If tracker is locked to a specific Daniewatch group, ignore activity from all other groups
    if (data.targetGroupJid && groupId !== data.targetGroupJid) return;

    const targetGroup = data.targetGroupJid || groupId;

    const rawNumber = userJid.split('@')[0].split(':')[0];
    const cleanUserJid = `${rawNumber}@s.whatsapp.net`;

    if (!data[targetGroup] || !Array.isArray(data[targetGroup].inactiveMembers)) return;

    const index = data[targetGroup].inactiveMembers.indexOf(cleanUserJid);
    if (index !== -1) {
        data[targetGroup].inactiveMembers.splice(index, 1);
        saveInactiveData(data);
        console.log(`[InactiveTracker] 🟢 Removed ${cleanUserJid} from Daniewatch inactive list (${reason})`);
        gitPushSync();
    }
}

/**
 * Returns current list of inactive members for the target Daniewatch group
 */
function getInactiveMembers(groupId) {
    const data = loadInactiveData();
    const targetGroup = data.targetGroupJid || groupId;

    if (data.targetGroupJid && groupId !== data.targetGroupJid) {
        return { locked: true, targetGroupJid: data.targetGroupJid, targetGroupName: data[data.targetGroupJid]?.groupName || 'Daniewatch Group' };
    }

    if (!data[targetGroup] || !Array.isArray(data[targetGroup].inactiveMembers)) {
        return null;
    }
    return data[targetGroup];
}

/**
 * Removes users from the tracking list after they are kicked
 */
function removeKickedUsers(groupId, jids) {
    const data = loadInactiveData();
    const targetGroup = data.targetGroupJid || groupId;

    if (!data[targetGroup] || !Array.isArray(data[targetGroup].inactiveMembers)) return;

    data[targetGroup].inactiveMembers = data[targetGroup].inactiveMembers.filter(
        jid => !jids.includes(jid)
    );

    saveInactiveData(data);
    gitPushSync();
}

/**
 * Configures Baileys event listeners for read receipts and message reactions
 */
function setupTrackerListeners(conn) {
    if (!conn || conn._inactiveTrackerInitialized) return;
    conn._inactiveTrackerInitialized = true;

    // 1. Listen for Message Read Receipts (User viewed message)
    conn.ev.on('message-receipt.update', (receipts) => {
        try {
            for (const receipt of receipts) {
                const groupId = receipt.key?.remoteJid;
                if (!groupId || !groupId.endsWith('@g.us')) continue;

                if (Array.isArray(receipt.userJids)) {
                    for (const userJid of receipt.userJids) {
                        markUserActive(groupId, userJid, 'read_receipt');
                    }
                }
            }
        } catch (err) {
            console.warn('[InactiveTracker] Error in message-receipt.update:', err.message);
        }
    });

    // 2. Listen for Emoji Reactions & Messages
    conn.ev.on('messages.upsert', ({ messages }) => {
        try {
            for (const msg of messages) {
                const groupId = msg.key?.remoteJid;
                if (!groupId || !groupId.endsWith('@g.us')) continue;

                // Reaction handling
                if (msg.message?.reactionMessage) {
                    const sender = msg.key?.participant || msg.participant || msg.key?.remoteJid;
                    if (sender) {
                        markUserActive(groupId, sender, 'reaction');
                    }
                }

                // General message handling
                const sender = msg.key?.participant || msg.participant;
                if (sender && !msg.key?.fromMe) {
                    markUserActive(groupId, sender, 'message');
                }
            }
        } catch (err) {
            console.warn('[InactiveTracker] Error in messages.upsert tracker:', err.message);
        }
    });

    console.log('[InactiveTracker] ✅ Activity tracking listeners registered (Exclusively tuned for Daniewatch Group).');
}

module.exports = {
    loadInactiveData,
    saveInactiveData,
    getTargetGroupJid,
    lockTargetGroup,
    initGroupTracker,
    markUserActive,
    getInactiveMembers,
    removeKickedUsers,
    setupTrackerListeners
};
