// ═══════════════════════════════════════════════════════════════════════
//  anti_ban.js — DanieWatch Human Simulation & Anti-Ban Safeguards
// ═══════════════════════════════════════════════════════════════════════

/**
 * Returns a random delay in milliseconds between minMs and maxMs.
 * Hard-capped at max 2000ms (2 seconds) per user preference.
 */
function getRandomDelay(minMs = 400, maxMs = 1500) {
    const cappedMax = Math.min(maxMs, 2000);
    const cappedMin = Math.min(minMs, cappedMax);
    return Math.floor(Math.random() * (cappedMax - cappedMin + 1)) + cappedMin;
}

/**
 * Marks incoming message as read (sends blue tick / read receipt to WhatsApp servers).
 */
async function markAsRead(conn, mek) {
    if (!conn || !mek || !mek.key) return;
    try {
        if (typeof conn.readMessages === 'function') {
            await conn.readMessages([mek.key]);
        }
    } catch (_) {}
}

/**
 * Sends presence update ('composing' for typing or 'recording' for audio).
 */
async function simulateHumanTyping(conn, jid, mode = 'composing') {
    if (!conn || !jid) return;
    try {
        if (typeof conn.sendPresenceUpdate === 'function') {
            await conn.sendPresenceUpdate(mode, jid);
        }
    } catch (_) {}
}

/**
 * Combined Anti-Ban protection helper:
 * 1. Marks message as read
 * 2. Triggers 'composing' typing status
 * 3. Pauses for a short random delay (max 2 seconds)
 */
async function applyAntiBanPresence(conn, mek, jid, mode = 'composing') {
    if (mek) await markAsRead(conn, mek);
    if (jid) await simulateHumanTyping(conn, jid, mode);
    const delayMs = getRandomDelay(400, 1500);
    await new Promise(resolve => setTimeout(resolve, delayMs));
}

module.exports = {
    getRandomDelay,
    markAsRead,
    simulateHumanTyping,
    applyAntiBanPresence
};
