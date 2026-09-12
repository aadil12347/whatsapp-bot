const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../config.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL/KEY env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const GROUP_JID = '120363431265171489@g.us';

// Base timestamp: Sept 12, 2026 ~8:00 AM PKT (03:00 UTC)
// Using relative offset from a known timestamp in the existing data
const BASE_TS = 1789160000000;
const STEP = 300000; // 5 min spacing for ordering
let idx = 0;

function ts() { return BASE_TS + (idx++) * STEP; }

// ─── List 1 (first .createlist message) ───
const list1_movies = [
    { title: 'Cocktail 2', year: '2026' },
    { title: 'HIT: The First Case', year: '2020' },
    { title: 'HIT: The 2nd Case', year: '2022' },
    { title: 'HIT: The Third Case', year: '2025' },
    { title: 'Slither', year: '2006' },
    { title: 'The Town', year: '2010' },
    { title: 'Pitt Siyapa', year: '2026' },
    { title: 'Kushi', year: '2023' },
    { title: 'Thiruchitrambalam', year: '2022' },
    { title: 'Bring Her Back', year: '2025' },
    { title: 'Kalvan', year: '2024' },
    { title: 'Super Nani', year: '2014' },
    { title: 'Dasara', year: '2023' },
    { title: 'Hi Nanna', year: '2023' },
    { title: 'Saiyaara', year: '2025' },
];

const list1_series = [
    { title: 'Peaky Blinders', year: '2013', season: 'S01' },
    { title: 'The Lord of the Rings: The Rings of Power', year: '2022', season: 'S01' },
    { title: 'The Lord of the Rings: The Rings of Power', year: '2024', season: 'S02' },
    { title: 'Vikings: Valhalla', year: '2023', season: 'S02' },
    { title: 'The Legend of Kitchen Soldier', year: '2026', season: 'S01' },
    { title: 'Berlin', year: '2023', season: 'S01' },
];

// ─── List 2 (second .createlist message) ───
const list2_movies = [
    { title: "Pete's Dragon", year: '2016' },
    { title: 'Green Lantern', year: '2011' },
    { title: 'Watchmen', year: '2009' },
    { title: 'The Raid', year: '2012' },
    { title: 'The Raid 2', year: '2014' },
    { title: 'Dus', year: '2005' },
    { title: 'Bāhubali: The Beginning', year: '2015' },
    { title: 'Return to Silent Hill', year: '2026' },
    { title: 'Rambo Collection', year: 'N/A' },
    { title: 'Secret Games', year: '1992' },
    { title: 'Shaadi Mein Zaroor Aana', year: '2017' },
    { title: 'Dobaaraa', year: '2022' },
    { title: 'Oho Enthan Baby', year: '2025' },
    { title: 'The Angry Birds Movie', year: '2016' },
    { title: 'The Angry Birds Movie 2', year: '2019' },
    { title: 'Secret Games 3', year: '1994' },
    { title: 'Tere Naam', year: '2003' },
    { title: 'Into the Storm', year: '2014' },
    { title: 'Geostorm', year: '2017' },
    { title: 'Darr', year: '1993' },
];

const list2_series = [
    { title: 'Hustlers', year: '2024', season: 'S01' },
    { title: 'Peacemaker', year: '2022', season: 'S01' },
    { title: 'Peacemaker', year: '2025', season: 'S02' },
];

// Build combined releases array
const releases = [];

for (const m of list1_movies) {
    releases.push({ title: m.title, year: m.year, season: null, isSeries: false, groupJid: GROUP_JID, source: 'p_command', timestamp: ts() });
}
for (const s of list1_series) {
    releases.push({ title: s.title, year: s.year, season: s.season, isSeries: true, groupJid: GROUP_JID, source: 'p_command', timestamp: ts() });
}
for (const m of list2_movies) {
    releases.push({ title: m.title, year: m.year, season: null, isSeries: false, groupJid: GROUP_JID, source: 'p_command', timestamp: ts() });
}
for (const s of list2_series) {
    releases.push({ title: s.title, year: s.year, season: s.season, isSeries: true, groupJid: GROUP_JID, source: 'p_command', timestamp: ts() });
}

console.log(`📋 Combined releases: ${releases.length} total (${list1_movies.length + list2_movies.length} movies, ${list1_series.length + list2_series.length} series)`);

async function run() {
    // Update the existing row (id=1)
    const { error } = await supabase
        .from('daily_releases')
        .update({
            releases_data: releases,
            state_data: {},
            updated_at: new Date().toISOString()
        })
        .eq('id', 1);

    if (error) {
        console.error('❌ Supabase upsert error:', error.message);
        process.exit(1);
    }

    console.log(`✅ Seeded ${releases.length} releases into Supabase daily_releases table.`);

    // Also write to local file
    const releasesFile = path.join(__dirname, '../session/daily_releases.json');
    const dir = path.dirname(releasesFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(releasesFile, JSON.stringify(releases, null, 2), 'utf-8');
    console.log(`📁 Also wrote to local ${releasesFile}`);
}

run().catch(console.error);
