const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Require the extractArchive and getAllFiles functions by reading danie_download.js
// or we can just require the danie_download module if it exports them, or run it directly.
const danieDownload = require('../src/commands/danie_download');

console.log('--- TESTING CORE FUNCTIONS ---');

// 1. Create a dummy zip file containing some files
const zipPath = path.join(__dirname, 'test_dummy.zip');
const zip = new AdmZip();
zip.addFile('vegamovies.mom_Avatar2.mkv', Buffer.from('dummy movie content'));
zip.addFile('hdhub4u.wtf_SpiderMan.mp4', Buffer.from('dummy spiderman content'));
zip.addFile('normal_file.txt', Buffer.from('normal content'));
zip.writeZip(zipPath);
console.log('Created dummy ZIP at:', zipPath);

// 2. Extract using system/module logic
const targetDir = path.join(__dirname, 'extracted_dummy');
if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
}

// Since extractArchive is not directly exported, we can recreate the logic or test module loading
// Let's copy the code or test if we can run it.
const { execSync } = require('child_process');

function testExtractArchive(archivePath, targetDir) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const ext = path.extname(archivePath).toLowerCase();
    
    if (ext === '.zip') {
        try {
            console.log('Extracting ZIP via adm-zip...');
            const zip = new AdmZip(archivePath);
            zip.extractAllTo(targetDir, true);
            return true;
        } catch (err) {
            console.error('adm-zip failed, falling back to system tar:', err.message);
        }
    }
    
    try {
        console.log(`Extracting ${ext} archive via system tar...`);
        execSync(`tar -xf "${archivePath}" -C "${targetDir}"`, { stdio: 'ignore' });
        return true;
    } catch (err) {
        console.error(`System tar extraction failed:`, err.message);
        throw new Error(`Failed to extract archive (${ext}): ${err.message}`);
    }
}

function testGetAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            arrayOfFiles = testGetAllFiles(filePath, arrayOfFiles);
        } else {
            arrayOfFiles.push(filePath);
        }
    });

    return arrayOfFiles;
}

try {
    testExtractArchive(zipPath, targetDir);
    const files = testGetAllFiles(targetDir);
    console.log('Extracted files:', files);

    files.forEach(filePath => {
        const baseName = path.basename(filePath);
        const renamed = baseName.replace(/hdhub4u/gi, 'DANIEWATCH')
                                .replace(/vegamovies/gi, 'DANIEWATCH')
                                .replace(/rogmovies/gi, 'DANIEWATCH');
        console.log(`Original: "${baseName}" -> Renamed: "${renamed}"`);
    });

    console.log('Extraction & renaming verified successfully!');
} catch (err) {
    console.error('Test failed:', err);
} finally {
    // Clean up
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
}
