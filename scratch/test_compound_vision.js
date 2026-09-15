require('dotenv').config({ path: './config.env' });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

async function testCompoundVision() {
    const imgPath = path.resolve("E:/0.1 Github Repo/Whatsapp Bot Automation/17-9-990x1381.jpg");
    const imgBuffer = fs.readFileSync(imgPath);
    const base64Image = imgBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    try {
        console.log("Testing groq/compound...");
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'groq/compound',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'What movie poster/actor is in this image?' },
                            { type: 'image_url', image_url: { url: dataUrl } }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Result:", response.data.choices[0].message.content);
    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
    }
}

testCompoundVision();
