const axios = require('axios');
const cheerio = require('cheerio');
const { extractDirectDownloadLinks, extractSubOptions } = require('../src/Utils/movie_scraper');

async function test() {
    const url = 'https://nexdrive.fit/genxfm784776393879/';
    try {
        console.log('Fetching landing page hosts...');
        const hosts = await extractDirectDownloadLinks(url);
        console.log('Hosts found:', hosts.map(h => `${h.text} -> ${h.href}`));
        
        console.log('\nExtracting sub-options for all landing hosts concurrently...');
        
        // Filter landing/redirect hosts
        const landingHosts = hosts.filter(h => {
            const lower = h.href.toLowerCase();
            return lower.includes('vcloud') || 
                   lower.includes('hubcloud') || 
                   lower.includes('gdflix') || 
                   lower.includes('fastdl') || 
                   lower.includes('filebee');
        });
        
        const results = await Promise.all(landingHosts.map(async (host) => {
            try {
                const subOpts = await extractSubOptions(host.href);
                return subOpts.map(opt => ({
                    parentHost: host.text,
                    text: opt.text,
                    href: opt.href
                }));
            } catch (err) {
                console.error(`Failed to resolve options for ${host.text}:`, err.message);
                return [];
            }
        }));
        
        const mergedOptions = results.flat();
        console.log('\n--- MERGED OPTIONS ---');
        console.log(JSON.stringify(mergedOptions, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

test();
