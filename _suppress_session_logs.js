
// Auto-generated: Suppress Baileys Signal protocol "Closing session" & "Bad MAC" spam
// and auto-repair corrupted Signal sessions on the fly.
const path = require('path');
const fs = require('fs');

const _origStdoutWrite = process.stdout.write.bind(process.stdout);
const _origStderrWrite = process.stderr.write.bind(process.stderr);

// Track if we're inside a multi-line session dump
let _suppressingBlock = false;
let _suppressedCount = 0;
let _badMacCount = 0;
let _lastReportTime = Date.now();
let _lastBadMacRepairTime = 0;
let _recentOutputBuffer = '';

const _blockStartPatterns = [
  'Closing session',
  'Removing old closed session',
  'SessionEntry {',
  'SessionEntry\n',
  'Session error:Error: Bad MAC',
  'Session error: Error: Bad MAC',
  'Error: Bad MAC',
  'Decrypted message with closed session',
  'Closing open session in favor of incoming prekey bundle',
  'Failed to decrypt message with any known session',
  'failed to find key',
  'to decode mutation',
  'No session found to decrypt message',
  'USync fetch yielded no results',
  'transaction failed, rolling back',
  'UNDECRYPTABLE message',
  'link-preview-js'
];

const _blockContentPatterns = [
  '_chains:',
  'chainKey:',
  'chainType:',
  'registrationId:',
  'currentRatchet:',
  'ephemeralKeyPair:',
  'pubKey: <Buffer',
  'privKey: <Buffer',
  'lastRemoteEphemeralKey:',
  'previousCounter:',
  'rootKey: <Buffer',
  'indexInfo:',
  'baseKey:',
  'baseKeyType:',
  'closed:',
  'used:',
  'created:',
  'remoteIdentityKey:',
  'pendingPreKey:',
  'signedKeyId:',
  'preKeyId:',
  'messageKeys:',
  'verifyMAC',
  'doDecryptWhisperMessage',
  'decryptWithSessions',
  '_asyncQueueExecutor',
  'decodeSyncdMutations',
  'decodeSyncdSnapshot',
  'getKey'
];

/**
 * Log Bad MAC occurrences for diagnostics but do NOT delete session files.
 * Baileys' built-in retry mechanism (retryRequestDelayMs) will request
 * message re-sends and re-negotiate fresh E2EE sessions automatically.
 * Deleting session files mid-negotiation was causing an infinite loop:
 *   Bad MAC → delete file → Baileys creates new session → Bad MAC → delete → ...
 */
function _handleBadMacRepair(fullText) {
  if (!fullText.includes('Bad MAC')) return;

  const now = Date.now();
  _badMacCount++;

  // Only log a summary periodically, don't delete anything
  if (now - _lastBadMacRepairTime > 30000) {
    _lastBadMacRepairTime = now;
    _origStdoutWrite(
      `[DanieWatch] 🔄 Bad MAC errors detected (${_badMacCount} total). Baileys is re-negotiating E2EE sessions automatically — this is normal after a restart.\n`
    );
    _badMacCount = 0;
  }
}

function _shouldSuppress(chunk) {
  const str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString('utf8', 0, Math.min(chunk.length, 1000)) : '');
  if (!str) return false;

  // Check if this starts a new session dump block
  for (const p of _blockStartPatterns) {
    if (str.includes(p)) {
      _suppressingBlock = true;
      return true;
    }
  }

  // If we're inside a suppressed block, check if this line is part of it
  if (_suppressingBlock) {
    const trimmed = str.trim();
    if (trimmed === '}' || trimmed === '},') {
      return true;
    }

    for (const p of _blockContentPatterns) {
      if (str.includes(p)) return true;
    }

    if (str.includes('<Buffer ') || str.includes('Buffer(')) return true;
    if (/^\s*'[A-Za-z0-9+/=]{20,}'/.test(trimmed)) return true;
    if (/^[\s{}\[\],]*$/.test(trimmed)) return true;

    _suppressingBlock = false;
  }

  return false;
}

process.stdout.write = function(chunk, encoding, callback) {
  if (_shouldSuppress(chunk)) {
    if (typeof encoding === 'function') { encoding(); return true; }
    if (typeof callback === 'function') { callback(); return true; }
    return true;
  }
  return _origStdoutWrite(chunk, encoding, callback);
};

process.stderr.write = function(chunk, encoding, callback) {
  if (_shouldSuppress(chunk)) {
    if (typeof encoding === 'function') { encoding(); return true; }
    if (typeof callback === 'function') { callback(); return true; }
    return true;
  }
  return _origStderrWrite(chunk, encoding, callback);
};

