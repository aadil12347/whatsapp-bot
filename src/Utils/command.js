
// ═══════════════════════════════════════════════════════════════════════
//  command.js — Simplified command registration for DanieWatch Bot
//  No longer needs to intercept/block framework commands since queen.js
//  is replaced by queen_lite.js which doesn't load framework plugins.
// ═══════════════════════════════════════════════════════════════════════

let commands = [];

/**
 * Register a command with pattern matching.
 * This is the cmd() function that command files call to register handlers.
 * queen_lite.js doesn't use this for dispatching (danie_download.js handles
 * its own messages directly), but youtube.js and other migrated commands
 * register here for the DANIE_COMMANDS system to call them.
 */
function cmd(config, handler) {
    if (!config) return;

    // Normalize config
    if (!config.dontAddCommandList) config.dontAddCommandList = false;
    if (!config.desc) config.desc = '';
    if (!config.category) config.category = 'misc';
    if (!config.filename) config.filename = '';
    if (!config.react) config.react = false;

    commands.push({ ...config, function: handler });
    return config;
}

module.exports = {
    cmd,
    AddCommand: cmd,
    Function: cmd,
    Module: cmd,
    commands
};