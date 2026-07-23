const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const rcpUrl = 'https://cloudorchestranova.com/rcp/YTgxZjE1ZTVlNWMzNmI1NDIxYTJiNTZhZTU2YjZiOTc6YTFONGJFODBTa1ZqVkZFMFdWcFBTV3Q0VXpoQ2RXTnlUa1ZrZURsUlpsa3hSbmxxYlhkRWJWRjBWR3RFY0VGYWFqZFZkVEprVjA1d0wwZFZaamhQVm5oUlVGcFdSVVpxYUc5Q1QyVlBZWGxVZVU4M2VYWndkRVpWZGtZME9XUTBkMGRvTkZOd2QyZGpjMFZDUnprck56ZDVhVXRFT0dsWVEzVktaV0ZVTTBaeGNDdGpSVGhEYW05amQxWndTSE5QT1ZoNVpVWTFTM2RTVERCcVIwVmFOMk50VUVGWFFrazFkRzFyYTIwMWR6UmhWRVJ0WWl0RlpIVmFSazlzV1RkMU9IQldRMGhtZDNCc2QwRkpTV28wYm5kMGVrVlZZMHhxWlhSQ00xZ3hiemREY2pGd1NFbExlVVpTVUVONVFuRlZSMUptVkdsWFVFODBNblkyYTA5M1QzRm1lVlZxVGxaSmRXVmhZa3R2WVdSS1RraEdNbFJ2VDJKU09YQkpaR2g1VERWRWMxSmpha1l2U1RkeVZYTTBNelpaYldoRFRsVkhSbUY0VlRKMmRrUlNRalJPZEUxVWMyeFVOemxLT1ZObU4yaFNkV3hFZUdKaE5XRldRblEzYzBaeFFqUm9hMDFuV21vcmFtMHJXbkkxU1UxdVJuRlJkVWxEWTNkQ2RtcHhXRVJzTVU1RVQyMTBhSE5JVDIxeFpTdGhOV2xpVVdoQlJGUjRLM0ZUYUVwNllXdFVlV1J5UjI1dFN6aGFWMmRKYnpOSmIzWjBkbFJTYmtObFVIVXlkekpWVjBoMmRGSm1OR2xCZUZCamNqQjRPRUl2TkUxdU1uVjZiV2MwVkhGT1NFOTROMjVwWWxwb1MyeE5hako0YWtJeFRrMVlRaTlUU1VKTVVucE9NMUZDZWxBd01sUlpjRXBvZVZSVWJ6UjZNREo1VTBsT2JIWkJSM2x2ZDBacmJUQk1NeTlvYmtSaFIybDVaM2hWUVdka2RUUnhRbUppWnpCWVZuWlNhVk14Umxob2JuZDRkRmh3U1VwcGFGVXZkV2xRWjBkVk5VbEdhVVJoYWxwUmFHaEVTRFpSV0hsd1VVUlBhR3RzVURCVlFrZHBRMFpyTjBWQ2NEWlViMGN3VTBwQ1JHb3hUbGxWYUdoMmFtOU5OV1JMYW5CNE5qRkpkbHBQVFVSTEwxVmlNbTFFYUdkdGJtVklTWE5YZUVzclRrOUdlVkpFU1djMGVYZFVMMWR4WlUxcVpITmxWek5zWlcxVllsUjVWa3hTYkZSM3V4UlJSMEpSUVVOelVYWTFZVFpGV0dkdFJEWlRaMFpKYWpOWmRWSXhjRkU1WW5Gdk1UZEpRa1JpUVdKeWNFTmtVR3RrZWpCNFZtd3JVME13TTBGMGMzQnRkMWx6V201WVQxTkpZakp3ZUc5TVFqVmFVMk51ZFVZMlppc3laVkEyTm5Rck5XdFZjM2hRVmxCV2RYQlZZV2RxT0hCTGQyMU5iVVZhV0Vkc1NtaDRSRGhZUlUwNFJWUmFWMngwU0VWRFVqZHJWRkpVUlU1TkwzVlBZVkUxTUhKTFJ6UkxjVzkzWldVclNFOXZVVTEzYm5wQk5qRkpkMjk0TVZwSWMwSTJWRVZVWlhWNk5qQm9NMHc0TVRKWFdHVnVkaTk2Vmtkc1pqTnBUSEZMUTBRNWMyNU9Ua1J2ZUZaWGRERTVVQ3MwYUdWMFQzcHBVM1UyVW5aNVZreGpOV3MxZEhwTmVXbFVNbFJOVVhaNVVqTlhZVnB6WW5FNUswd3JWbVp6WW1abFZHUTFiak5NSzBaNlozUndlV3B1WVhWQlJUQmxiRmxJWkhGbEszaGpjVzAyYzNscFQxSnNRVkZrUWtwbVJsQTBVbWs0Vmpkd1RHSnJMMHd6VFZObU4wUkNVRGsxVFhWb2RUUndXblpQTmtkT1YyVXhiVmd4TVZRNE1GQTNTamQ0TWpSMlNHcE9XRlY1TkRNNWJuVktkMjFRTDJvek5FNW5ibUZvWTNkb1EyZGthblJWUzFGalprOUNOalI2TjNKRmVEVktibmhMT0VjM01reGpkSEUwV0VSeWQyNWhNbTVZY1dJNVIwZEViMGRGYmtoalQzUmtVMVp3YURkaWQwWmtWVU5IUmk5TE5HYzVZMlY1VjJwVk5WQnZURTFZTTBoMFFrOHJWelZ0TW5wTGQxTnlUek5tZEZaWkwwbEJkemt4ZG1odFpqUTFja2s5';

    console.log('Fetching RCP player page...');
    const res = await axios.get(rcpUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://vidsrc.me/'
        }
    });

    console.log('RCP Status:', res.status);
    const $ = cheerio.load(res.data);
    const scripts = $('script').map((i, el) => $(el).html()).get();
    console.log(`Scripts found: ${scripts.length}`);
    scripts.forEach((s, idx) => {
        if (s && (s.includes('m3u8') || s.includes('sources') || s.includes('file') || s.includes('hls') || s.includes('src'))) {
            console.log(`\nScript ${idx}:\n`, s.substring(0, 1000));
        }
    });
}

test().catch(console.error);
