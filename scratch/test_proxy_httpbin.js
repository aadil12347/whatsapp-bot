const axios = require('axios');

// Using npm package if available or standard tunnel format
let HttpsProxyAgent;
try {
    HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) {
    console.log('https-proxy-agent package not installed, testing direct axios proxy config...');
}

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

async function testHttpBin(raw) {
    const parts = raw.split(':');
    const [ip, port, user, pass] = parts;
    const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;

    try {
        let agent;
        if (HttpsProxyAgent) {
            agent = new HttpsProxyAgent(proxyUrl);
        }

        const res = await axios.get('https://httpbin.org/ip', {
            ...(agent ? { httpsAgent: agent } : {
                proxy: { protocol: 'http', host: ip, port: parseInt(port, 10), auth: { username: user, password: pass } }
            }),
            timeout: 5000
        });
        console.log(`[ALIVE] ${raw} -> IP: ${res.data.origin}`);
        return raw;
    } catch (e) {
        console.log(`[DEAD] ${raw} -> ${e.message}`);
        return null;
    }
}

async function run() {
    console.log('Testing proxy connectivity on httpbin.org/ip...\n');
    const working = [];
    const batchSize = 10;
    for (let i = 0; i < rawProxies.length; i += batchSize) {
        const batch = rawProxies.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(testHttpBin));
        results.forEach(r => { if (r) working.push(r); });
    }
    console.log(`\nWorking count: ${working.length}/${rawProxies.length}`);
    console.log(working);
}

run();
