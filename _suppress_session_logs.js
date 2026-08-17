
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
  '_asyncQueueExecutor'
];

/**
 * Automatically repairs corrupted Signal session files when "Bad MAC" errors occur.
 * Extracts session ID (e.g. 17064693616661_1.0) and unlinks corrupted files.
 */
function _handleBadMacRepair(fullText) {
  if (!fullText.includes('Bad MAC')) return;

  const now = Date.now();
  _badMacCount++;

  const sessionDir = path.join(__dirname, 'session');
  const sessDir = path.join(__dirname, 'sess');

  // Extract session identifier from stack trace (e.g. "at async 17064693616661_1.0 [as awaitable]")
  const matches = fullText.match(/at async ([a-zA-Z0-9_\-.]+)/g) || [];
  const extractedIds = new Set();
  for (const m of matches) {
    const id = m.replace('at async ', '').trim();
    if (id && id !== '_asyncQueueExecutor' && id !== 'SessionCipher') {
      extractedIds.add(id);
    }
  }

  let deletedCount = 0;
  const deleteMatchingSessionFiles = (dir) => {
    if (!fs.existsSync(dir)) return;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'creds.json') continue;

        let match = false;
        if (extractedIds.size > 0) {
          for (const id of extractedIds) {
            if (file.includes(id)) {
              match = true;
              break;
            }
          }
        }

        if (match) {
          try {
            const filePath = path.join(dir, file);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  };

  if (extractedIds.size > 0) {
    deleteMatchingSessionFiles(sessionDir);
    deleteMatchingSessionFiles(sessDir);
  }

  if (now - _lastBadMacRepairTime > 5000) {
    _lastBadMacRepairTime = now;
    const idList = Array.from(extractedIds).join(', ');
    _origStdoutWrite(
      `[DanieWatch] 🧹 Auto-healed Bad MAC session corruption${idList ? ` (${idList})` : ''}. Deleted ${deletedCount} corrupted file(s). WhatsApp will re-establish E2EE session on next message.\n`
    );
  }
}

function _shouldSuppress(chunk) {
  const str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString('utf8', 0, Math.min(chunk.length, 1000)) : '');
  if (!str) return false;

  // Append to recent buffer for multi-line stack trace inspection
  _recentOutputBuffer += str;
  if (_recentOutputBuffer.length > 4000) {
    _recentOutputBuffer = _recentOutputBuffer.slice(-2000);
  }

  if (str.includes('Bad MAC')) {
    _handleBadMacRepair(_recentOutputBuffer);
  }

  // Check if this starts a new session dump block
  for (const p of _blockStartPatterns) {
    if (str.includes(p)) {
      _suppressingBlock = true;
      _suppressedCount++;
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

    const now = Date.now();
    if (_suppressedCount > 0 && (now - _lastReportTime) > 30000) {
      _origStdoutWrite('[DanieWatch] 🔇 Suppressed ' + _suppressedCount + ' Signal session / Bad MAC log entries\n');
      _suppressedCount = 0;
      _lastReportTime = now;
    }
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

