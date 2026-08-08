const axios = require('axios');
const fs = require('fs');
const path = require('path');

const getBuffer = async (url, options = {}) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Request': 1,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            },
            ...options,
            responseType: 'arraybuffer'
        });
        return res.data;
    } catch (e) {
        throw e;
    }
};

const fetchJson = async (url, options = {}) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            },
            ...options
        });
        return res.data;
    } catch (e) {
        throw e;
    }
};

const fetchBuffer = async (url, options = {}) => {
    return await getBuffer(url, options);
};

const getGroupAdmins = (participants = []) => {
    const admins = [];
    for (let i of participants) {
        if (i.admin === 'admin' || i.admin === 'superadmin') admins.push(i.id);
    }
    return admins;
};

const getRandom = (ext = '') => {
    return `${Math.floor(Math.random() * 1000000000)}${ext}`;
};

const h2k = (number) => {
    var SI_POSTFIXES = ["", " K", " M", " G", " T", " P", " E"];
    var tier = Math.log10(Math.abs(number)) / 3 | 0;
    if (tier == 0) return number;
    var postfix = SI_POSTFIXES[tier];
    var scale = Math.pow(10, tier * 3);
    var scaled = number / scale;
    var formatted = scaled.toFixed(1) + '';
    if (/\.0$/.test(formatted)) formatted = formatted.substr(0, formatted.length - 2);
    return formatted + postfix;
};

const isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'));
};

const Json = (obj) => {
    return JSON.stringify(obj, null, 2);
};

const runtime = (seconds) => {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor((seconds % (3600 * 24)) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);

    var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
};

const sleep = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const getFile = async (PATH, save) => {
    let filename;
    let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await getBuffer(PATH) : fs.existsSync(PATH) ? fs.readFileSync(PATH) : Buffer.alloc(0);
    let type = { mime: 'application/octet-stream', ext: 'bin' };
    if (data.length > 0) {
        try {
            const FileType = require('file-type');
            const ft = await FileType.fromBuffer(data);
            if (ft) type = ft;
        } catch (_) {}
    }
    if (save && data.length > 0) {
        filename = path.join(__dirname, '../tmp', `${Date.now()}.${type.ext}`);
        await fs.promises.writeFile(filename, data);
    }
    return {
        res: null,
        filename,
        size: data.length,
        ...type,
        data
    };
};

module.exports = {
    getBuffer,
    fetchJson,
    fetchBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    getFile
};
