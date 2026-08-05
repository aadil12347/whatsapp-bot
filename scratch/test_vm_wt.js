const vm = require('vm');
const axios = require('axios');

async function testVmWt() {
    console.log('[Test VM] Fetching config.js and wt.obf.js...');

    const configRes = await axios.get('https://gofile.io/dist/js/config.js');
    const wtRes = await axios.get('https://gofile.io/dist/js/wt.obf.js');

    const appdata = {};
    const sandbox = {
        appdata: appdata,
        window: {
            location: {
                search: '',
                hostname: 'gofile.io',
                href: 'https://gofile.io/d/bE4nvt'
            }
        },
        document: {
            createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
            getElementsByTagName: () => [],
            body: { appendChild: () => {} }
        },
        URLSearchParams: class {
            constructor(s) {}
            get(k) { return null; }
        },
        Math: Math,
        parseFloat: parseFloat,
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    };

    sandbox.window.window = sandbox.window;
    sandbox.window.appdata = appdata;
    vm.createContext(sandbox);

    // Replace `const appdata = {};` with `appdata = appdata || {};` in config.js
    const configCode = configRes.data.replace('const appdata', 'appdata');
    vm.runInContext(configCode, sandbox);
    console.log('Before wt.obf.js, appdata.wt:', sandbox.appdata?.wt);

    // Run wt.obf.js
    try {
        vm.runInContext(wtRes.data, sandbox);
        console.log('After wt.obf.js, appdata.wt:', sandbox.appdata?.wt);
    } catch (e) {
        console.error('wt.obf.js execution error:', e.message);
    }

    const computedWt = sandbox.appdata?.wt;
    console.log('Computed wt token:', computedWt);

    if (computedWt) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Origin': 'https://gofile.io',
            'Referer': 'https://gofile.io/d/bE4nvt',
            'Accept': '*/*'
        };

        const accRes = await axios.post('https://api.gofile.io/accounts', {}, { headers });
        const token = accRes.data?.data?.token;

        console.log(`\nTesting API with computed wt="${computedWt}" and token="${token}"...`);
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

testVmWt();
