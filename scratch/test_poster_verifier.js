require('dotenv').config({ path: './config.env' });
const { verifyPosterWithUserTitle } = require('../src/Utils/ai_provider');
const { searchMoviesAndSeries } = require('../src/Utils/movie_scraper');

async function testHybridVerifier() {
    console.log("=== Testing Hybrid Poster & Title Verification Pipeline ===");

    // Simulating user input `.search Hasin Dilruba 2021` with images.jpg attached
    const userPrompt = "Hasin Dilruba 2021";
    const posterMetadata = {
        query: "Haseen Dillruba",
        year: "2021",
        origin: "indian",
        language: "hindi",
        type: "movie"
    };

    console.log(`User Input: "${userPrompt}"`);
    console.log(`Poster Metadata:`, posterMetadata);

    const verifiedIntent = await verifyPosterWithUserTitle(userPrompt, posterMetadata);
    console.log("\nVerified Intent Output:", verifiedIntent);

    // Run search with verified intent
    console.log(`\nExecuting Dual Search for Verified Title: "${verifiedIntent.query}"...`);
    const results = await searchMoviesAndSeries(verifiedIntent.query, verifiedIntent.origin, verifiedIntent);

    console.log(`Found ${results.length} candidate post(s). Top match:`);
    if (results.length > 0) {
        console.log(`Title: ${results[0].title}`);
        console.log(`Site: ${results[0].site}`);
        console.log(`Score: ${results[0].score}`);
        console.log(`Link: ${results[0].link}`);
    }
}

testHybridVerifier();
