require('dotenv').config({ path: './config.env' });
const { handleAiSearchCommand } = require('../src/commands/ai_search');

// Mock socket message
const mockPost = {
    title: "Download M3GAN 2.0 (2025) Dual Audio {Hindi DD5.1-English} WEB-DL 480p [380MB] | 720p [1.1GB] | 1080p [2.8GB]",
    site: "Vegamovies",
    thumbnail: "https://example.com/poster.jpg"
};

console.log("=== Testing Title & Year Sync from Candidate Post ===");

const raw = mockPost.title.replace(/^download\s+/i, '').trim();
const yearMatch = raw.match(/\b(19\d\d|20\d\d)\b/);
const year = yearMatch ? yearMatch[1] : null;

const clean = raw
    .replace(/\s*\(\s*(?:19|20)\d\d\s*\)/gi, '')
    .replace(/\s*\(\s*season\s+.*?\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\|/g, '')
    .replace(/\b(dual|multi|audio|hindi|english|dubbed|subbed|esub|org|web-dl|webdl|bluray|hdrip|480p|720p|1080p|2160p|4k|dd5\.1|dd\+5\.1|movie)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-:\.\s]+$/, '').trim();

console.log(`Cleaned Post Title: "${clean}"`);
console.log(`Extracted Year: "${year}"`);

if (clean === "M3GAN 2.0" && year === "2025") {
    console.log("✅ Success: Clean title 'M3GAN 2.0' and year '2025' correctly extracted!");
} else {
    console.error("❌ Failed title/year extraction!");
}
