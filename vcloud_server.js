const express = require('express');

// Ensure the server itself does NOT use the remote VCLOUD_SERVER (would cause infinite recursion)
delete process.env.VCLOUD_SERVER;

const { extractSubOptions, resolveVcloudLink, extractDirectDownloadLinks } = require('./src/Utils/movie_scraper');

const app = express();
const PORT = 7845;

// Secret key to prevent random people from using your server
const SECRET = process.env.VCLOUD_SECRET || 'danie2026';

app.use((req, res, next) => {
    const key = req.query.key || req.headers['x-api-key'];
    if (key !== SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// GET /resolve?url=https://vcloud.zip/xxx
app.get('/resolve', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

    console.log(`[VCloudServer] Resolving: ${url}`);
    try {
        const directUrl = await resolveVcloudLink(url);
        console.log(`[VCloudServer] Resolved: ${directUrl}`);
        res.json({ success: true, directUrl });
    } catch (e) {
        console.error(`[VCloudServer] Resolve failed: ${e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /suboptions?url=https://vcloud.zip/xxx
app.get('/suboptions', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

    console.log(`[VCloudServer] Extracting sub-options: ${url}`);
    try {
        const subOpts = await extractSubOptions(url);
        console.log(`[VCloudServer] Found ${subOpts.length} sub-options`);
        res.json({ success: true, subOptions: subOpts });
    } catch (e) {
        console.error(`[VCloudServer] SubOptions failed: ${e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /hosts?url=https://nexdrive.fit/xxx
app.get('/hosts', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'Missing ?url= parameter' });

    console.log(`[VCloudServer] Extracting host links: ${url}`);
    try {
        const hosts = await extractDirectDownloadLinks(url);
        console.log(`[VCloudServer] Found ${hosts.length} host links`);
        res.json({ success: true, hosts });
    } catch (e) {
        console.error(`[VCloudServer] Hosts failed: ${e.message}`);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health check
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`\n🖥️  VCloud Extraction Server running on http://localhost:${PORT}`);
    console.log(`🔑 Secret key: ${SECRET}`);
    console.log(`\n📌 Steps to expose to internet (100% FREE):\n`);
    console.log(`   1. Open a NEW terminal window`);
    console.log(`   2. Run: npx -y cloudflared tunnel --url http://localhost:${PORT}`);
    console.log(`   3. Copy the https://xxxxx.trycloudflare.com URL it gives you`);
    console.log(`   4. In Codespaces, add to config.env: VCLOUD_SERVER=https://xxxxx.trycloudflare.com`);
    console.log(`   5. Restart your bot in Codespaces\n`);
});
