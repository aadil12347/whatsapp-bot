const { scrapeHomepagePosts, searchMoviesAndSeries } = require('../src/Utils/movie_scraper');
const { extractSearchIntent, understandUniversalIntent } = require('../src/Utils/ai_provider');

async function runTests() {
    console.log('🧪 --- STARTING UNIVERSAL AI AGENT TEST SUITE ---');

    // 1. Test Homepage Scraper
    try {
        console.log('\n--- 1. Testing Homepage Scraper ---');
        const posts = await scrapeHomepagePosts('vegamovies');
        console.log(`✅ Vegamovies Homepage returned ${posts.length} posts. Top post: "${posts[0]?.title}" (${posts[0]?.link})`);
    } catch (e) {
        console.error('❌ Homepage scraper test failed:', e.message);
    }

    // 2. Test Dual Search Engine & Scoring for "custody 2023 indian movie tamil"
    try {
        console.log('\n--- 2. Testing Dual Search & Candidate Post Scorer ---');
        const candidates = await searchMoviesAndSeries('custody 2023 indian movie tamil', 'indian', { year: '2023', language: 'tamil' });
        console.log(`✅ Dual Search returned ${candidates.length} candidate(s).`);
        candidates.slice(0, 5).forEach((c, idx) => {
            console.log(`  [${idx + 1}] Score: ${c._score} | Site: ${c.site} | Title: "${c.title}"`);
        });
    } catch (e) {
        console.error('❌ Dual search test failed:', e.message);
    }

    // 3. Test Intent & Action Router
    try {
        console.log('\n--- 3. Testing Universal AI Intent Classifier ---');

        const testPrompts = [
            "custody 2023 indian movie tamil",
            "extract the vegamovies homepage",
            "turn on antilink on the request daniewatch group",
            "add the custody indian tamil 2023 movie to the queue and dont send the poster caption or trailer",
            "clear my download queue",
            "who directed the movie Inception?"
        ];

        for (const prompt of testPrompts) {
            console.log(`\nInput: "${prompt}"`);
            const intent = await understandUniversalIntent(prompt);
            console.log(` -> Classified Action:`, intent);
        }
    } catch (e) {
        console.error('❌ Intent classifier test failed:', e.message);
    }

    console.log('\n✅ --- ALL TESTS COMPLETED ---');
}

runTests();
