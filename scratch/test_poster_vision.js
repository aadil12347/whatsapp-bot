require('dotenv').config({ path: './config.env' });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

async function testVision() {
    const imgPath = path.resolve("E:/0.1 Github Repo/Whatsapp Bot Automation/17-9-990x1381.jpg");
    const imgBuffer = fs.readFileSync(imgPath);
    const base64Image = imgBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    console.log("Analyzing image via Groq Vision API...");

    const visionModels = ['llama-3.2-11b-vision-preview', 'llama-3.2-90b-vision-preview'];

    for (const model of visionModels) {
        try {
            console.log(`Trying model: ${model}`);
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Analyze this image (poster/screenshot) and identify the movie or TV show.
Extract and return STRICT JSON format with keys:
- "query": Official Title of the movie/series
- "year": 4-digit release year if known/associated (e.g. "1972")
- "origin": "indian" or "non-indian"
- "language": primary language (e.g. "english", "hindi")
- "type": "movie" or "series"
- "cast_or_character": Key character or actor depicted in image
- "confidence": confidence score from 0.0 to 1.0

Return ONLY JSON, no markdown formatting.`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: dataUrl
                                    }
                                }
                            ]
                        }
                    ],
                    temperature: 0.1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${GROQ_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("SUCCESS with model:", model);
            console.log("Raw output:", response.data.choices[0].message.content);
            return;
        } catch (err) {
            console.error(`Failed with ${model}:`, err.response?.data || err.message);
        }
    }
}

testVision();
