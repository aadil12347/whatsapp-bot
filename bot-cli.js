const https = require('https');
const fs = require('fs');
const path = require('path');

// Load config.env if available
const envPath = path.join(__dirname, 'config.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const OWNER = process.env.GH_OWNER || 'griffithbuildwiseestimation-cmd';
const REPO = process.env.GH_REPO || 'whatsapp-bot';

const command = process.argv[2]?.toLowerCase();

if (!command || !['start', 'stop', 'logs', 'status'].includes(command)) {
    console.log(`
🤖 WhatsApp Bot GitHub Actions CLI

Usage:
  node bot-cli.js start   - 🚀 Start the WhatsApp bot on GitHub Actions
  node bot-cli.js stop    - 🛑 Stop/Cancel active running bot workflows
  node bot-cli.js logs    - 📜 Show live logs and status of recent workflow runs
  node bot-cli.js status  - 📊 Check if the bot is currently running
`);
    process.exit(0);
}

function ghRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${OWNER}/${REPO}${endpoint}`,
            method,
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'WhatsApp-Bot-CLI',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
                    } catch (e) {
                        resolve({ status: res.statusCode, data });
                    }
                } else {
                    reject(new Error(`GitHub API Error [HTTP ${res.statusCode}]: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    try {
        if (command === 'start') {
            console.log(`🚀 Triggering bot start on repository ${OWNER}/${REPO}...`);
            await ghRequest('POST', '/dispatches', { event_type: 'run-bot' });
            console.log('✅ Trigger sent successfully! The bot will start in GitHub Actions in a few seconds.');
            console.log('💡 Tip: Run "node bot-cli.js logs" to monitor execution.');
        } 
        else if (command === 'stop') {
            console.log(`🔍 Checking active workflow runs on ${OWNER}/${REPO}...`);
            const { data } = await ghRequest('GET', '/actions/runs?status=in_progress');
            const activeRuns = data.workflow_runs || [];

            if (activeRuns.length === 0) {
                console.log('ℹ️ No active bot workflow runs found.');
                return;
            }

            for (const run of activeRuns) {
                console.log(`🛑 Stopping workflow run #${run.run_number} (ID: ${run.id})...`);
                await ghRequest('POST', `/actions/runs/${run.id}/cancel`);
            }
            console.log('✅ All active bot workflow runs have been stopped!');
        } 
        else if (command === 'status' || command === 'logs') {
            console.log(`📊 Fetching recent workflow runs for ${OWNER}/${REPO}...\n`);
            const { data } = await ghRequest('GET', '/actions/runs?per_page=5');
            const runs = data.workflow_runs || [];

            if (runs.length === 0) {
                console.log('ℹ️ No workflow runs found yet for this repository.');
                return;
            }

            console.log('----------------------------------------------------------------------');
            for (const run of runs) {
                const icon = run.status === 'in_progress' ? '🔄' : (run.conclusion === 'success' ? '✅' : (run.conclusion === 'cancelled' ? '🛑' : '❌'));
                console.log(`${icon} Run #${run.run_number} | Event: ${run.event} | Status: ${run.status} (${run.conclusion || 'running'})`);
                console.log(`   Started: ${new Date(run.created_at).toLocaleString()}`);
                console.log(`   HTML URL: ${run.html_url}`);

                // Fetch jobs for in_progress or latest run
                if (run.status === 'in_progress' || run === runs[0]) {
                    try {
                        const jobsRes = await ghRequest('GET', `/actions/runs/${run.id}/jobs`);
                        const jobs = jobsRes.data.jobs || [];
                        for (const job of jobs) {
                            console.log(`   Job: ${job.name} [${job.status} / ${job.conclusion || 'running'}]`);
                            for (const step of job.steps || []) {
                                const stepIcon = step.status === 'completed' ? (step.conclusion === 'success' ? '  ✓' : '  基础') : '  ⏳';
                                console.log(`      ${stepIcon} ${step.name} (${step.status})`);
                            }
                        }
                    } catch (e) {
                        // ignore job fetch error
                    }
                }
                console.log('----------------------------------------------------------------------');
            }
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
