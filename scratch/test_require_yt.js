const fs = require('fs');
const path = require('path');

try {
    const yt = require('../src/commands/youtube');
    console.log('Successfully required src/commands/youtube.js!');
} catch(e) {
    console.error('Error requiring youtube.js:', e);
}
