const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function extractArchive(archivePath, targetDir) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    const ext = path.extname(archivePath).toLowerCase();
    
    if (ext === '.zip') {
        try {
            console.log('[Test] Extracting ZIP via adm-zip...');
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(archivePath);
            zip.extractAllTo(targetDir, true);
            return true;
        } catch (err) {
            console.error('[Test] adm-zip failed, falling back to system tar:', err.message);
        }
    }
    
    // Fallback to system tar for other formats or if adm-zip fails
    try {
        console.log(`[Test] Extracting ${ext} archive via system tar...`);
        execSync(`tar -xf "${archivePath}" -C "${targetDir}"`, { stdio: 'ignore' });
        return true;
    } catch (err) {
        console.error(`[Test] System tar extraction failed:`, err.message);
        throw new Error(`Failed to extract archive (${ext}): ${err.message}`);
    }
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file) => {
        const filePath = path.join(dirPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
        } else {
            arrayOfFiles.push(filePath);
        }
    });

    return arrayOfFiles;
}

// Test renaming logic
function testRename(filename) {
    const renamed = filename
        .replace(/hdhub4u/gi, 'DANIEWATCH')
        .replace(/vegamovies/gi, 'DANIEWATCH')
        .replace(/rogmovies/gi, 'DANIEWATCH');
    console.log(`Rename: "${filename}" -> "${renamed}"`);
    return renamed;
}

console.log('--- RUNNING ZIP/TAR/RAR EXTRACTION AND RENAMING PROTOTYPE TESTS ---');

// Test renaming pattern
testRename('[Hdhub4u.Vip] - Avatar 2009.mkv');
testRename('vegamovies.mom_Spiderman_No_Way_Home.mp4');
testRename('RogMovies-The_Matrix_Resurrections_720p.mkv');
testRename('Normal_movie_name.mkv');

console.log('--- TEST RUN COMPLETED ---');
