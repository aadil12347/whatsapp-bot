const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// ---- Test 1: parseDownloadItem with problematic URLs ----
function parseDownloadItem(item) {
    let customFilename = null;
    let url = item.trim();
    const firstEqIdx = item.indexOf('=');
    if (firstEqIdx !== -1) {
        const leftPart = item.substring(0, firstEqIdx).trim();
        const rightPart = item.substring(firstEqIdx + 1).trim();
        if (!leftPart.startsWith('http://') && !leftPart.startsWith('https://')) {
            customFilename = leftPart;
            url = rightPart;
        }
    } else {
        const lastSpaceIdx = item.lastIndexOf(' ');
        if (lastSpaceIdx !== -1) {
            const lastWord = item.substring(lastSpaceIdx + 1).trim();
            if (lastWord.startsWith('http://') || lastWord.startsWith('https://')) {
                customFilename = item.substring(0, lastSpaceIdx).trim();
                url = lastWord;
            }
        }
    }
    return { customFilename, url };
}

console.log('=== TEST 1: URL Parsing ===');
const t1 = parseDownloadItem('https://pub-xxx.r2.dev/abc?token=1784097413124');
console.log('Direct URL with token:', t1.url.startsWith('https://') ? 'PASS' : 'FAIL', t1);

const t2 = parseDownloadItem('https://xxx.r2.cloudflarestorage.com/hub2/file.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123');
console.log('S3 presigned URL:', t2.url.startsWith('https://') ? 'PASS' : 'FAIL', '(url preserved intact:', t2.url.includes('X-Amz-Signature=abc123') ? 'YES)' : 'NO)');

const t3 = parseDownloadItem('myfile.mp4 = https://example.com/file.mp4');
console.log('Custom name + URL:', t3.customFilename === 'myfile.mp4' && t3.url === 'https://example.com/file.mp4' ? 'PASS' : 'FAIL', t3);

// ---- Test 2: isMoviePage hostname-only check ----
console.log('\n=== TEST 2: Movie Page Detection (hostname only) ===');
function checkMoviePage(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        return ['vegamovies', 'rogmovies', 'hdhub4u'].some(d => hostname.includes(d));
    } catch (e) { return false; }
}
console.log('CDN link with vegamovies in PATH:', checkMoviePage('https://xxx.r2.cloudflarestorage.com/hub2/file-Vegamovies.hot.zip') ? 'FAIL (false positive!)' : 'PASS (correctly ignored)');
console.log('Actual vegamovies page:', checkMoviePage('https://vegamovies.navy/download-something/') ? 'PASS' : 'FAIL');

// ---- Test 3: Archive detection (no dot prefix) ----
console.log('\n=== TEST 3: Archive Extension Detection ===');
function isArchiveExt(ext) {
    return ['zip', 'tar', 'gz', 'tgz', 'rar', 'rar5', '7z'].includes(ext.toLowerCase());
}
console.log('ext="zip":', isArchiveExt('zip') ? 'PASS' : 'FAIL');
console.log('ext="mp4":', !isArchiveExt('mp4') ? 'PASS' : 'FAIL');
console.log('ext="rar":', isArchiveExt('rar') ? 'PASS' : 'FAIL');

// ---- Test 4: Content-Disposition parsing ----
console.log('\n=== TEST 4: Content-Disposition Parsing ===');
const cd1 = "attachment; filename*=UTF-8''Little.House-Vegamovies.hot.zip";
const m1 = cd1.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
console.log('UTF-8 CD:', m1 ? decodeURIComponent(m1[1].trim()) : 'FAIL');

const cd2 = "Little.House-Vegamovies.hot.zip";
const m2 = cd2.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
console.log('Plain CD (no filename= prefix):', m2 ? 'matched' : 'no match (OK - raw value handled separately)');

// ---- Test 5: file-type magic bytes with openSync ----
console.log('\n=== TEST 5: file-type Magic Bytes via openSync ===');
const fileType = require('file-type');
const zipPath = path.join(__dirname, 'test_magic.zip');
const zip = new AdmZip();
zip.addFile('test.txt', Buffer.from('hello'));
zip.writeZip(zipPath);

const fd = fs.openSync(zipPath, 'r');
const magicBuffer = Buffer.alloc(4100);
fs.readSync(fd, magicBuffer, 0, 4100, 0);
fs.closeSync(fd);

fileType.fromBuffer(magicBuffer).then(result => {
    console.log('Detected type:', result ? `${result.ext} / ${result.mime}` : 'NONE');
    console.log('Is zip?', result && result.ext === 'zip' ? 'PASS' : 'FAIL');
    fs.unlinkSync(zipPath);
    console.log('\n=== ALL TESTS COMPLETED ===');
});
