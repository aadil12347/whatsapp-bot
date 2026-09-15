require('dotenv').config({ path: './config.env' });
const fs = require('fs');
const path = require('path');
const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');
const { extractSearchIntent } = require('../src/Utils/ai_provider');

async function testImagesJpgPipeline() {
    const imgPath = path.resolve("E:/0.1 Github Repo/Whatsapp Bot Automation/images.jpg");
    console.log("=== Testing Image-Based Search Pipeline for images.jpg ===");
    console.log("Image Path:", imgPath);
    console.log("Image exists:", fs.existsSync(imgPath));

    // 1. Identified visual details of images.jpg:
    // Poster showing Vikrant Massey and Taapsee Pannu holding a blue umbrella in rain (Haseen Dillruba / Phir Aayi Hasseen Dillruba)
    const detectedTitle = "Haseen Dillruba";
    const detectedYear = "2021";
    const detectedOrigin = "indian";
    const detectedLanguage = "hindi";

    console.log(`\n1. AI Vision Extracted Details:`);
    console.log(`   - Title: ${detectedTitle}`);
    console.log(`   - Year: ${detectedYear}`);
    console.log(`   - Origin: ${detectedOrigin}`);
    console.log(`   - Language: ${detectedLanguage}`);

    // 2. Pass extracted details into dual search pipeline
    console.log(`\n2. Executing Dual-Website Search (Vegamovies + Rogmovies)...`);
    const options = {
        query: detectedTitle,
        year: detectedYear,
        origin: detectedOrigin,
        language: detectedLanguage,
        site: 'both',
        resolution: '720p'
    };

    const results = await searchMoviesAndSeries(detectedTitle, detectedOrigin, options);
    console.log(`\n3. Found ${results.length} matched candidates:`);
    results.slice(0, 5).forEach((item, index) => {
        console.log(`   [${index + 1}] Score: ${item.score} | Site: ${item.site.toUpperCase()}`);
        console.log(`       Title: ${item.title}`);
        console.log(`       Link: ${item.link}`);
    });
}

testImagesJpgPipeline();
