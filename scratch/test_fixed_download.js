const path = require('path');
const fs = require('fs');

(() => {
    console.log('--- 1. Testing Filename Sanitization for Windows Paths ---');
    const problematicTitle = "Download Superman (2025) WEB-DL {English With Subtitles} Full Movie 480p [418MB] | 720p [1.3GB] | 1080p [2.7GB]";
    
    const safeTempFilename = (problematicTitle || 'download_file')
        .replace(/[:*?"<>|\\/]/g, '_')
        .replace(/[\{\}\[\]]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80);

    const tempFilePath = path.join(__dirname, 'tmp_' + Date.now() + '_' + safeTempFilename);
    console.log('Generated safe temp path:', tempFilePath);

    try {
        fs.writeFileSync(tempFilePath, 'test content', 'utf8');
        console.log('File created successfully without ENOENT error!');
        fs.unlinkSync(tempFilePath);
        console.log('File cleaned up.');
    } catch (err) {
        console.error('FAILED to create file:', err.message);
        process.exit(1);
    }

    console.log('\n✅ FILENAME SANITIZATION TEST PASSED CLEANLY!');
})();
