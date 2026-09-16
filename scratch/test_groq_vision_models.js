require('dotenv').config({ path: './config.env' });
const axios = require('axios');

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

async function testGroqVision() {
    console.log("=== Testing Groq Vision Models with sample base64 ===");
    console.log("GROQ_KEY present:", !!GROQ_KEY);

    // 1x1 transparent PNG base64
    const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const candidateVisionModels = [
        'llama-3.2-11b-vision-preview',
        'llama-3.2-90b-vision-preview',
        'llama-3.2-11b-instruct',
        'llava-v1.5-7b-4096-preview',
        'groq/compound-mini',
        'openai/gpt-oss-120b'
    ];

    for (const model of candidateVisionModels) {
        try {
            console.log(`\nTesting model: ${model}...`);
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: model,
                messages: [
                    { role: 'system', content: 'You are an image vision assistant. Output strict JSON with key "query".' },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Describe what you see or output {"query": "sample"}' },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${sampleBase64}` } }
                        ]
                    }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            console.log(`✅ Success with ${model}:`, response.data.choices[0].message.content);
            return;
        } catch (err) {
            console.warn(`❌ Model ${model} failed:`, err.response?.data || err.message);
        }
    }
}

testGroqVision();
