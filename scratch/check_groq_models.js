require('dotenv').config({ path: './config.env' });
const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

async function checkModels() {
    try {
        const res = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });
        const models = res.data.data.map(m => m.id);
        console.log("=== Active Groq Models ===");
        console.log(models);
    } catch (e) {
        console.error("Error fetching models:", e.response?.data || e.message);
    }
}

checkModels();
