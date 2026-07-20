const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function killPreviousInstances() {
    const sessionDir = path.join(__dirname, '..', '..', 'session');
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    const pidFile = path.join(sessionDir, 'bot.pid');
    const myPid = process.pid;
    const parentPid = process.ppid;

    console.log(`[SingleInstance] Initializing single instance guard (PID: ${myPid}, Parent PID: ${parentPid})...`);

    // 1. Kill PID recorded in session/bot.pid if running and different from me and my parent
    if (fs.existsSync(pidFile)) {
        try {
            const oldPidStr = fs.readFileSync(pidFile, 'utf-8').trim();
            const oldPid = parseInt(oldPidStr, 10);
            if (!isNaN(oldPid) && oldPid !== myPid && oldPid !== parentPid) {
                console.log(`[SingleInstance] Found previous running bot process (PID: ${oldPid}). Terminating...`);
                try {
                    process.kill(oldPid, 'SIGKILL');
                } catch (_) {}

                if (process.platform === 'win32') {
                    try {
                        execSync(`taskkill /F /PID ${oldPid}`, { stdio: 'ignore' });
                    } catch (_) {}
                }
            }
        } catch (e) {
            console.error('[SingleInstance] Error reading/killing old PID:', e.message);
        }
    }

    // 2. Cross-platform cleanup of duplicate Node processes running start.js or queen.js
    if (process.platform === 'win32') {
        try {
            const psScript = [
                `$currentPid = ${myPid};`,
                `$ppid = ${parentPid || 0};`,
                `$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' };`,
                `foreach ($p in $procs) {`,
                `  if ($p.ProcessId -ne $currentPid -and $p.ProcessId -ne $ppid) {`,
                `    $cmd = $p.CommandLine;`,
                `    if ($cmd -and ($cmd.Contains('queen.js') -or $cmd.Contains('start.js'))) {`,
                `      Write-Host "Terminating duplicate node process PID: $($p.ProcessId)";`,
                `      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue;`,
                `    }`,
                `  }`,
                `}`
            ].join(' ');

            const killedInfo = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { encoding: 'utf-8' }).trim();
            if (killedInfo) {
                console.log(`[SingleInstance] ${killedInfo}`);
            }
        } catch (e) {
            // Silently ignore if PowerShell query fails
        }
    } else {
        // Unix/Linux process cleanup
        try {
            const script = `pgrep -f "node.*(queen\.js|start\.js)" | grep -v "^${myPid}$" | grep -v "^${parentPid}$" | xargs -r kill -9`;
            execSync(script, { stdio: 'ignore' });
        } catch (_) {}
    }

    // 3. Write current PID to lockfile
    try {
        fs.writeFileSync(pidFile, String(myPid), 'utf-8');
    } catch (e) {
        console.error('[SingleInstance] Failed to write PID file:', e.message);
    }

    // Clean lockfile on process exit
    const cleanupLock = () => {
        try {
            if (fs.existsSync(pidFile)) {
                const currentContent = fs.readFileSync(pidFile, 'utf-8').trim();
                if (currentContent === String(myPid)) {
                    fs.unlinkSync(pidFile);
                }
            }
        } catch (_) {}
    };

    process.once('exit', cleanupLock);
    process.once('SIGINT', () => { cleanupLock(); process.exit(0); });
    process.once('SIGTERM', () => { cleanupLock(); process.exit(0); });
}

module.exports = { killPreviousInstances };
