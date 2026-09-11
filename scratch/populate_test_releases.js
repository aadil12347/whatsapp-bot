const { addDailyRelease, formatDailyReleaseList } = require('../src/Utils/daily_releases');

// Add test entries to daily releases cache
addDailyRelease({
    title: 'Oppenheimer',
    year: '2023',
    season: null,
    isSeries: false,
    groupJid: '120363263215689587@g.us'
});

addDailyRelease({
    title: 'Avatar: The Way of Water',
    year: '2022',
    season: null,
    isSeries: false,
    groupJid: '120363263215689587@g.us'
});

addDailyRelease({
    title: 'House of the Dragon',
    year: '2022',
    season: 'S02',
    isSeries: true,
    groupJid: '120363263215689587@g.us'
});

addDailyRelease({
    title: 'The Boys',
    year: '2019',
    season: 'S04',
    isSeries: true,
    groupJid: '120363263215689587@g.us'
});

addDailyRelease({
    title: 'Stranger Things',
    year: '2016',
    season: 'S04',
    isSeries: true,
    groupJid: '120363263215689587@g.us'
});

addDailyRelease({
    title: 'Dune: Part Two',
    year: '2024',
    season: null,
    isSeries: false,
    groupJid: '120363263215689587@g.us'
});

console.log('✅ Daily release cache populated!');
console.log('\n--- OUTPUT PREVIEW ---');
console.log(formatDailyReleaseList('꧁࿇♥𝑫𝒂𝒏𝒊𝒆𝑾𝒂𝒕𝒄𝒉🎥🍿꧂'));
