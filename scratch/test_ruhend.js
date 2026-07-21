try {
    const ruhend = require('ruhend-scraper');
    console.log('ruhend keys:', Object.keys(ruhend));
} catch(e) {
    console.error('ruhend error:', e.message);
}

try {
    const dylux = require('api-dylux');
    console.log('dylux keys:', Object.keys(dylux));
} catch(e) {
    console.error('dylux error:', e.message);
}
