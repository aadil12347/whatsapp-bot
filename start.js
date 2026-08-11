const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const { killPreviousInstances } = require('./src/Utils/singleInstance');
killPreviousInstances();

const { downloadSessionFromSupabase } = require('./src/Utils/supabaseSession');

/**
 * Auto-patch libsignal's session_record.js to silence verbose session logging.
 * The library logs entire SessionEntry objects (with all crypto Buffer keys)
 * on every session open/close/cleanup, producing 17,000+ lines that block
 * the Node.js event loop and make the bot unresponsive.
 * This patch runs on every startup so it survives npm reinstalls.
 */
function patchLibsignal() {
    try {
        // Find session_record.js in node_modules
        const candidates = [
            path.join(__dirname, 'node_modules', '.pnpm', 'libsignal@6.0.0', 'node_modules', 'libsignal', 'src', 'session_record.js'),
        ];
        // Also try to find dynamically
        try {
            const libsignalMain = require.resolve('libsignal');
            const libsignalDir = path.dirname(libsignalMain);
            candidates.push(path.join(libsignalDir, 'src', 'session_record.js'));
        } catch (_) {}

        let patched = 0;
        for (const filePath of candidates) {
            if (!fs.existsSync(filePath)) continue;
            let content = fs.readFileSync(filePath, 'utf-8');
            if (!content.includes('console.info("Closing session:"') && 
                !content.includes('console.warn("Session already closed"') &&
                !content.includes('console.info("Removing old closed session:"')) {
                continue; // Already patched
            }
            content = content
                .replace(/console\.warn\("Session already closed",\s*session\);/g, '// [patched] silent')
                .replace(/console\.info\("Closing session:",\s*session\);/g, '// [patched] silent')
                .replace(/console\.warn\("Session already open"\);/g, '// [patched] silent')
                .replace(/console\.info\("Opening session:",\s*session\);/g, '// [patched] silent')
                .replace(/console\.info\("Removing old closed session:",\s*oldestSession\);/g, '// [patched] silent');
            fs.writeFileSync(filePath, content, 'utf-8');
            patched++;
        }
        if (patched > 0) {
            console.log(`🔧 Auto-patched libsignal session logging (${patched} file(s)) — prevents session dump spam`);
        }
    } catch (err) {
        console.warn('⚠️ Could not auto-patch libsignal (non-critical):', err.message);
    }
}
patchLibsignal();

function cleanCorruptedSessionFiles(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let removedCount = 0;
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isFile()) {
                if (fs.statSync(fullPath).size === 0) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                } else if (file.endsWith('.json')) {
                    try {
                        JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    } catch (_) {
                        fs.unlinkSync(fullPath);
                        removedCount++;
                    }
                }
            }
        }
        if (removedCount > 0) {
            console.log(`🧹 Cleaned ${removedCount} corrupted/0-byte session files from ${path.basename(dir)}/`);
        }
    } catch (_) {}
}

/**
 * Fresh start — delete ALL session files except creds.json on every startup.
 * creds.json = your WhatsApp login identity (keeps you logged in).
 * Everything else (pre-key, sender-key, session files) gets recreated 
 * automatically as needed. This prevents the Baileys Signal protocol
 * from entering an infinite session-sync loop on reconnect.
 */
function freshStartSession(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let removedCount = 0;
        for (const file of files) {
            // Keep ONLY creds.json — everything else is temporary
            if (file === 'creds.json') continue;
            
            const fullPath = path.join(dir, file);
            try {
                if (fs.statSync(fullPath).isFile()) {
                    fs.unlinkSync(fullPath);
                    removedCount++;
                }
            } catch (_) {}
        }
        if (removedCount > 0) {
            console.log(`🧹 Fresh start: removed ${removedCount} temporary session files from ${path.basename(dir)}/ (kept creds.json)`);
        }
    } catch (err) {
        console.warn('⚠️ Session cleanup error:', err.message);
    }
}

async function startBot() {
    console.log('🚀 Starting your custom DanieWatch Downloader Bot...');

    const sessionDir = path.join(__dirname, 'session');
    const sessDir = path.join(__dirname, 'sess');

    cleanCorruptedSessionFiles(sessionDir);
    cleanCorruptedSessionFiles(sessDir);
    freshStartSession(sessionDir);
    freshStartSession(sessDir);

    // Auto-download latest session from Supabase if available
    try {
        await downloadSessionFromSupabase(sessDir);
        cleanCorruptedSessionFiles(sessDir);
        // Clean stale files from sessDir too — only keep creds.json
        freshStartSession(sessDir);

        // Only copy creds.json from sess/ to session/ (not pre-keys, sessions, etc.)
        const credsInSess = path.join(sessDir, 'creds.json');
        if (fs.existsSync(credsInSess) && fs.statSync(credsInSess).size > 0) {
            if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
            const destCreds = path.join(sessionDir, 'creds.json');
            // Only copy if session/ doesn't already have a valid creds.json
            if (!fs.existsSync(destCreds) || fs.statSync(destCreds).size === 0) {
                fs.copyFileSync(credsInSess, destCreds);
                console.log('📁 Restored creds.json from Supabase backup into session/');
            }
        }
    } catch (e) {
        console.warn('⚠️ Note: Supabase session sync skipped or failed:', e.message || e);
    }

    // IMPORTANT: Clean stale session files AFTER Supabase restore.
    // Supabase restores ALL files including old pre-key/sender-key/session files
    // that cause "Closing session" spam and reconnection loops.
    // Only creds.json is needed — everything else gets recreated automatically.
    freshStartSession(sessionDir);

    // Auto-update: Pull fresh files from GitHub at startup
    try {
        console.log('🔄 Checking for fresh bot files from GitHub...');
        let pullOutput;
        try {
            pullOutput = execSync('git pull', { stdio: 'pipe', encoding: 'utf-8', timeout: 20000 });
        } catch (e) {
            pullOutput = execSync('git pull origin main', { stdio: 'pipe', encoding: 'utf-8', timeout: 20000 });
        }
        
        if (pullOutput.includes('Already up to date.') || pullOutput.includes('Already up-to-date.')) {
            console.log('✅ Your bot is already up-to-date with the repository.');
        } else {
            console.log('🎉 Successfully fetched fresh files from GitHub!');
            console.log(pullOutput);
            
            if (pullOutput.includes('package.json') || pullOutput.includes('pnpm-lock.yaml')) {
                console.log('⚠️ Dependencies might have changed. It is recommended to run "npm install" or "pnpm install" to ensure all packages are updated.');
            }
        }
    } catch (error) {
        console.warn('⚠️ Warning: Failed to fetch updates from GitHub (perhaps offline, no git repo initialized, or local conflicts exist):');
        console.warn(error.message);
    }

    const botBrainPath = path.join(__dirname, 'queen.js');

    if (!fs.existsSync(botBrainPath)) {
        console.error('❌ Error: queen.js is missing! Please make sure the brain file is in the folder.');
        process.exit(1);
    }

    // Create a preload script that intercepts process.stdout/stderr at the lowest level.
    // This is MORE RELIABLE than overriding console.log because:
    // 1. The obfuscated code in queen.js re-overrides console.log, defeating the old approach
    // 2. process.stdout.write is the lowest-level output — ALL logging goes through it
    // 3. No code can bypass this without directly accessing the file descriptor
    const preloadPath = path.join(__dirname, '_suppress_session_logs.js');
    fs.writeFileSync(preloadPath, `
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
  'SessionEntry\\n',
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
    if (/^\\s*'[A-Za-z0-9+/=]{20,}'/.test(trimmed)) return true;
    
    // If the line is just whitespace or braces, keep suppressing
    if (/^[\\s{}\\[\\],]*$/.test(trimmed)) return true;
    
    // Otherwise, end the suppression block
    _suppressingBlock = false;
    
    // Periodically report how many were suppressed
    const now = Date.now();
    if (_suppressedCount > 0 && (now - _lastReportTime) > 30000) {
      _origStdoutWrite('[DanieWatch] 🔇 Suppressed ' + _suppressedCount + ' Signal session log entries\\n');
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
`, 'utf-8');

    // Start the bot process with the log suppression preload
    const child = fork(botBrainPath, [], {
        stdio: 'inherit',
        windowsHide: true,
        execArgv: ['--require', preloadPath]
    });

    const maxRunMinutes = parseInt(process.env.MAX_RUN_TIME_MINUTES || '0', 10);
    if (maxRunMinutes > 0) {
        console.log(`⏱️ Auto-restart timer active: Bot will exit gracefully in ${maxRunMinutes} minutes to save session & end run.`);
        setTimeout(() => {
            console.log(`⏰ ${maxRunMinutes} minutes elapsed. Stopping bot process for clean exit...`);
            child.kill('SIGTERM');
            setTimeout(() => {
                if (!child.killed) child.kill('SIGKILL');
                process.exit(0);
            }, 5000);
        }, maxRunMinutes * 60 * 1000);
    }

    child.on('error', (err) => {
        console.error('❌ Bot crashed with error:', err.message);
    });

    child.on('exit', (code) => {
        console.log(`🤖 Bot process exited with code ${code}`);
        process.exit(code || 0);
    });
}

startBot();