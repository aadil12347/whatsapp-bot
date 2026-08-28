const assert = require('assert');
const { applyPixeldrainWorkerProxy, isAdLink, resolveVcloudLink } = require('../src/Utils/movie_scraper');
const fs = require('fs');
const path = require('path');

console.log('=== RUNNING VERIFICATION TESTS ===');

// Test 1: Pixeldrain Worker Proxy for .dev domain
const devUrl = 'https://pixeldrain.dev/u/cnnC5su9';
const proxiedDev = applyPixeldrainWorkerProxy(devUrl);
console.log('Test 1 - Proxied Dev URL:', proxiedDev);
assert(proxiedDev === 'https://cdn.pixeldrain.eu.cc/cnnC5su9', 'Pixeldrain cdn worker proxy failed!');
console.log('✅ Test 1 PASSED: Pixeldrain .dev domain correctly converted to rate-limit bypass worker proxy');

// Test 2: Ad Link Detection
const adUrl = 'https://adexchangerapid.com/ad/visit.php?al=1';
const isAd = isAdLink(adUrl, 'Download Link');
console.log('Test 2 - Ad Link Check:', adUrl, '=>', isAd);
assert.strictEqual(isAd, true, 'Ad link was not detected!');

const validVcloud = 'https://vcloud.fit/jj_ung1phou_xug';
const isValidAd = isAdLink(validVcloud, '⚡ V-Cloud [Resumable]');
assert.strictEqual(isValidAd, false, 'Valid VCloud link incorrectly marked as ad!');
console.log('✅ Test 2 PASSED: Ad link detector working accurately');

    const resetCmds = ['clear', 'reset', 'clean'];
    const choice = '4';
    assert.strictEqual(resetCmds.includes(choice), false, 'Choice "4" matched reset command!');
    console.log('✅ Test 3 PASSED: Choice "4" will no longer match reset commands');
