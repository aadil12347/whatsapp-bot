require('dotenv').config({ path: './config.env' });
const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

async function listAllModels() {
    try {
        const res = await axios.get('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` }
        });
        console.log(res.data.data.map(m => m.id));
    } catch (err) {
        console.error("Failed:", err.response?.data || err.message);
    }
}

listAllModels();
