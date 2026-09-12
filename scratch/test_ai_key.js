require('dotenv').config({ path: './config.env' });
const https = require('https');

async function testGroqKey(key) {
    console.log("🔍 Testing Groq Cloud API Key...");
    return new Promise((resolve, reject) => {
        const req = https.request('https://api.groq.com/openai/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log("✅ Groq API Key is VALID!");
                    resolve(true);
                } else {
                    console.log(`❌ Groq API Key Failed (Status ${res.statusCode}):`, data);
                    resolve(false);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function testGrokKey(key) {
    console.log("🔍 Testing xAI Grok API Key...");
    return new Promise((resolve, reject) => {
        const req = https.request('https://api.x.ai/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log("✅ xAI Grok API Key is VALID!");
                    resolve(true);
                } else {
                    console.log(`❌ xAI Grok API Key Failed (Status ${res.statusCode}):`, data);
                    resolve(false);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    const key = process.argv[2] || process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) {
        console.log("⚠️ No API Key found in arguments or config.env!");
        console.log("Usage: node scratch/test_ai_key.js <YOUR_API_KEY>");
        console.log("Or add GROQ_API_KEY or GROK_API_KEY to config.env");
        return;
    }

    if (key.startsWith('gsk_')) {
        await testGroqKey(key);
    } else if (key.startsWith('xai-')) {
        await testGrokKey(key);
    } else {
        console.log("Testing key against both Groq and xAI Grok endpoints...");
        const okGroq = await testGroqKey(key);
        if (!okGroq) await testGrokKey(key);
    }
}

main();
