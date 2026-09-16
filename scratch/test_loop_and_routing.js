const { isSearchKeywordPresent } = require('../src/Utils/ai_provider');

console.log("=== Testing Strict Voice/Natural Movie Search Keyword Requirement ===");
console.log("Rule: BOTH search word AND movie/season word are compulsory!\n");

const testCases = [
    { text: "search movie megan 2.0", expected: true, reason: "Has 'search' AND 'movie'" },
    { text: "search Stree 2 season 1", expected: true, reason: "Has 'search' AND 'season'" },
    { text: "download film Inception in 720p", expected: true, reason: "Has 'download' AND 'film' AND '720p'" },
    { text: "search megan 2.0", expected: false, reason: "Has 'search' but missing 'movie'/'season'" },
    { text: "megan 2.0 movie", expected: false, reason: "Has 'movie' but missing 'search'" },
    { text: "Stree 2 season 1", expected: false, reason: "Has 'season' but missing 'search'" },
    { text: "Hello Danie, how are you today?", expected: false, reason: "General chat - missing both" },
    { text: "What is the capital of France?", expected: false, reason: "General chat - missing both" }
];

let passed = 0;
for (const tc of testCases) {
    const res = isSearchKeywordPresent(tc.text);
    const ok = res === tc.expected;
    if (ok) passed++;
    console.log(`Input: "${tc.text}" -> SearchDetected: ${res} | Expected: ${tc.expected} [${ok ? '✅ PASS' : '❌ FAIL'}] (${tc.reason})`);
}

if (passed === testCases.length) {
    console.log(`\n✅ All ${passed}/${testCases.length} strict voice test cases passed!`);
} else {
    console.error(`\n❌ Failed ${testCases.length - passed} test cases.`);
}
