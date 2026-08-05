const { JSDOM } = require('jsdom');
const axios = require('axios');

async function testJsdomWt() {
    console.log('[Test JSDOM] Loading Gofile scripts in JSDOM...');

    const configRes = await axios.get('https://gofile.io/dist/js/config.js');
    const wtRes = await axios.get('https://gofile.io/dist/js/wt.obf.js');

    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
        url: 'https://gofile.io/d/bE4nvt',
        runScripts: 'dangerously',
        resources: 'usable'
    });

    const window = dom.window;

    // Execute config.js
    window.eval(configRes.data);
    console.log('Before wt.obf.js, appdata.wt:', window.appdata?.wt);

    // Execute wt.obf.js
    try {
        window.eval(wtRes.data);
        console.log('After wt.obf.js, appdata.wt:', window.appdata?.wt);
    } catch (e) {
        console.error('wt.obf.js execution error:', e.message);
    }

    const computedWt = window.appdata?.wt;
    console.log('Computed wt token:', computedWt);

    if (computedWt) {
        // Test API call with computedWt
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://gofile.io',
            'Referer': 'https://gofile.io/d/bE4nvt'
        };

        const accRes = await axios.post('https://api.gofile.io/accounts', {}, { headers });
        const token = accRes.data?.data?.token;

        console.log(`\nTesting API with JSDOM computed wt="${computedWt}" and token="${token}"...`);
        try {
            const apiRes = await axios.get(`https://api.gofile.io/contents/bE4nvt?wt=${computedWt}`, {
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log('✅ API SUCCESS!\n', JSON.stringify(apiRes.data, null, 2));
        } catch (err) {
            console.log('❌ API Error:', err.response ? JSON.stringify(err.response.data) : err.message);
        }
    }
}

testJsdomWt();
