
// Auto-generated: Suppress Baileys Signal protocol "Closing session" spam
// Uses process.stdout/stderr.write interception (can't be overridden by console.log replacements)
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
const _origStderrWrite = process.stderr.write.bind(process.stderr);

// Track if we're inside a multi-line session dump
let _suppressingBlock = false;
let _suppressedCount = 0;
let _lastReportTime = Date.now();

const _blockStartPatterns = [
  'Closing session',
  'Removing old closed session',
  'SessionEntry {',
  'SessionEntry\n',
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
];

function _shouldSuppress(chunk) {
  const str = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString('utf8', 0, Math.min(chunk.length, 500)) : '');
  if (!str) return false;

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
    // Check if it's a closing brace (end of block)
    const trimmed = str.trim();
    if (trimmed === '}' || trimmed === '},') {
      // Don't end suppression yet — there might be nested objects
      return true;
    }
    
    // Check for session content patterns
    for (const p of _blockContentPatterns) {
      if (str.includes(p)) return true;
    }
    
    // Check for Buffer patterns
    if (str.includes('<Buffer ') || str.includes('Buffer(')) return true;
    
    // Check for base64 key-like patterns (long alphanumeric with +/=)
    if (/^\s*'[A-Za-z0-9+/=]{20,}'/.test(trimmed)) return true;
    
    // If the line is just whitespace or braces, keep suppressing
    if (/^[\s{}\[\],]*$/.test(trimmed)) return true;
    
    // Otherwise, end the suppression block
    _suppressingBlock = false;
    
    // Periodically report how many were suppressed
    const now = Date.now();
    if (_suppressedCount > 0 && (now - _lastReportTime) > 30000) {
      _origStdoutWrite('[DanieWatch] 🔇 Suppressed ' + _suppressedCount + ' Signal session log entries\n');
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
