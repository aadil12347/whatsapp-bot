const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

console.log('📦 Zipping flat node_modules using AdmZip...');
const zip = new AdmZip();
const sourceFolder = path.join(__dirname, '../flat_node/node_modules');
const targetFile = path.join(__dirname, '../modules.zip');

zip.addLocalFolder(sourceFolder, 'node_modules');
zip.writeZip(targetFile);

console.log(`✅ Created modules.zip successfully! (${(fs.statSync(targetFile).size / 1024 / 1024).toFixed(2)} MB)`);
