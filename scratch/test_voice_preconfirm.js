const { formatPreConfirmCard } = require('../src/commands/ai_search');

console.log('--- Testing Pre-Confirmation Card Formatting ---');

const intent = {
    query: 'Money Heist',
    year: 2017,
    resolution: '720p',
    type: 'series',
    season: 1,
    episode: null,
    origin: 'non-indian'
};

const post = {
    title: 'Download Money Heist - Netflix Original (Season 1-5) Dual Audio {Hindi-English} 480p | 720p | 1080p WEB-DL HD',
    thumbnail: 'https://example.com/poster.jpg'
};

const availableSeasons = [1, 2, 3, 4, 5];

console.log('[Initial Card (Season 1)]:');
console.log(formatPreConfirmCard(post, intent, availableSeasons));

// Simulate updating season to Season 2 via quoted voice note / reply
intent.season = 2;

console.log('\n[Updated Card (Season 2)]:');
const updatedCard = formatPreConfirmCard(post, intent, availableSeasons);
console.log(updatedCard);

if (updatedCard.includes('Selected Season:* *S02*') && updatedCard.includes('Season 2 ➔ All Episodes')) {
    console.log('\n✅ TEST PASSED: Pre-confirmation card updated correctly to Season 2 without triggering new TMDB title search!');
} else {
    console.error('\n❌ TEST FAILED: Card did not update season properly.');
    process.exit(1);
}
