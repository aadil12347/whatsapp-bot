const axios = require('axios');
const https = require('https');

const rawProxies = [
    "31.59.20.176:6754:mjjkynza:lvz863zys0ls",
    "31.56.127.193:7684:mjjkynza:lvz863zys0ls",
    "45.38.107.97:6014:mjjkynza:lvz863zys0ls",
    "38.154.203.95:5863:mjjkynza:lvz863zys0ls",
    "198.105.121.200:6462:mjjkynza:lvz863zys0ls",
    "64.137.96.74:6641:mjjkynza:lvz863zys0ls",
    "198.23.243.226:6361:mjjkynza:lvz863zys0ls",
    "38.154.185.97:6370:mjjkynza:lvz863zys0ls",
    "142.111.67.146:5611:mjjkynza:lvz863zys0ls",
    "191.96.254.138:6185:mjjkynza:lvz863zys0ls",
    "31.59.20.176:6754:crtjaamk:5bp7w5zlgmc6",
    "31.56.127.193:7684:crtjaamk:5bp7w5zlgmc6",
    "45.38.107.97:6014:crtjaamk:5bp7w5zlgmc6",
    "38.154.203.95:5863:crtjaamk:5bp7w5zlgmc6",
    "198.105.121.200:6462:crtjaamk:5bp7w5zlgmc6",
    "64.137.96.74:6641:crtjaamk:5bp7w5zlgmc6",
    "198.23.243.226:6361:crtjaamk:5bp7w5zlgmc6",
    "38.154.185.97:6370:crtjaamk:5bp7w5zlgmc6",
    "142.111.67.146:5611:crtjaamk:5bp7w5zlgmc6",
    "191.96.254.138:6185:crtjaamk:5bp7w5zlgmc6",
    "31.59.20.176:6754:nsdjrpwt:odeh1yu3tv50",
    "31.56.127.193:7684:nsdjrpwt:odeh1yu3tv50",
    "45.38.107.97:6014:nsdjrpwt:odeh1yu3tv50",
    "38.154.203.95:5863:nsdjrpwt:odeh1yu3tv50",
    "198.105.121.200:6462:nsdjrpwt:odeh1yu3tv50",
    "64.137.96.74:6641:nsdjrpwt:odeh1yu3tv50",
    "198.23.243.226:6361:nsdjrpwt:odeh1yu3tv50",
    "38.154.185.97:6370:nsdjrpwt:odeh1yu3tv50",
    "142.111.67.146:5611:nsdjrpwt:odeh1yu3tv50",
    "191.96.254.138:6185:nsdjrpwt:odeh1yu3tv50",
    "31.59.20.176:6754:kboirlds:mluj3qcar4fp",
    "31.56.127.193:7684:kboirlds:mluj3qcar4fp",
    "45.38.107.97:6014:kboirlds:mluj3qcar4fp",
    "38.154.203.95:5863:kboirlds:mluj3qcar4fp",
    "198.105.121.200:6462:kboirlds:mluj3qcar4fp",
    "64.137.96.74:6641:kboirlds:mluj3qcar4fp",
    "198.23.243.226:6361:kboirlds:mluj3qcar4fp",
    "38.154.185.97:6370:kboirlds:mluj3qcar4fp",
    "142.111.67.146:5611:kboirlds:mluj3qcar4fp",
    "191.96.254.138:6185:kboirlds:mluj3qcar4fp",
    "31.59.20.176:6754:uscqaqmr:jm8g4dse9g8p",
    "31.56.127.193:7684:uscqaqmr:jm8g4dse9g8p",
    "45.38.107.97:6014:uscqaqmr:jm8g4dse9g8p",
    "38.154.203.95:5863:uscqaqmr:jm8g4dse9g8p",
    "198.105.121.200:6462:uscqaqmr:jm8g4dse9g8p",
    "64.137.96.74:6641:uscqaqmr:jm8g4dse9g8p",
    "198.23.243.226:6361:uscqaqmr:jm8g4dse9g8p",
    "38.154.185.97:6370:uscqaqmr:jm8g4dse9g8p",
    "142.111.67.146:5611:uscqaqmr:jm8g4dse9g8p",
    "191.96.254.138:6185:uscqaqmr:jm8g4dse9g8p"
];

function formatProxy(raw) {
    const parts = raw.split(':');
    if (parts.length === 4) {
        const [ip, port, user, pass] = parts;
        return {
            raw,
            url: `http://${user}:${pass}@${ip}:${port}`,
            host: ip,
            port: parseInt(port, 10),
            auth: { username: user, password: pass }
        };
    }
    return null;
}

const parsedProxies = rawProxies.map(formatProxy).filter(Boolean);

async function testSingleProxy(pObj) {
    const targetUrl = 'https://vcloud.zip/mrg9sjg5ec1nuze';
    try {
        const res = await axios.get(targetUrl, {
            proxy: {
                protocol: 'http',
                host: pObj.host,
                port: pObj.port,
                auth: pObj.auth
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://vcloud.zip/'
            },
            timeout: 6000,
            validateStatus: status => status >= 200 && status < 400
        });

        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const hasAtob = html.includes('atob(');
        const hasVarUrl = html.includes('var url');
        if (hasAtob || hasVarUrl) {
            console.log(`[SUCCESS] Proxy ${pObj.raw} -> Status ${res.status}, Length ${html.length}`);
            return pObj;
        } else {
            console.log(`[INVALID HTML] Proxy ${pObj.raw} -> Status ${res.status}, Length ${html.length}`);
            return null;
        }
    } catch (e) {
        console.log(`[FAILED] Proxy ${pObj.raw} -> ${e.message}`);
        return null;
    }
}

async function testAll() {
    console.log(`Testing ${parsedProxies.length} proxies against Cloudflare / vcloud.zip...\n`);
    const working = [];

    // Test in batches of 5 to speed up testing
    const batchSize = 5;
    for (let i = 0; i < parsedProxies.length; i += batchSize) {
        const batch = parsedProxies.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(testSingleProxy));
        results.forEach(res => {
            if (res) working.push(res);
        });
    }

    console.log(`\n===================================`);
    console.log(`Summary: ${working.length}/${parsedProxies.length} proxies are WORKING!`);
    console.log(`===================================`);
    console.log(JSON.stringify(working.map(w => w.raw), null, 2));
}

testAll();
