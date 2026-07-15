const axios = require('axios');
const cheerio = require('cheerio');
const { scrapeAllPostLinks, extractDirectDownloadLinks, extractSubOptions } = require('../src/Utils/movie_scraper');

const VEGAMOVIES_DOMAIN = 'https://vegamovies.navy';

async function checkYouLinks() {
    const postUrl = 'https://vegamovies.navy/download-see-you-at-work-tomorrow-season-1-hindi-dubbed-series-480p-720p-1080p-web-dl/';
    console.log(`\n========================================`);
    console.log(`1. Scraping post page: ${postUrl}`);
    
    try {
        const resolutions = await scrapeAllPostLinks(postUrl);
        
        // Filter down using the bot's logic
        const validResolutions = resolutions.filter(l => {
            const lowerHref = l.href.toLowerCase();
            const lowerText = l.text.toLowerCase();
            const lowerHeading = (l.heading || '').toLowerCase();
            
            const isVcloud = lowerHref.includes('vcloud') || 
                             lowerText.includes('v-cloud') || 
                             lowerText.includes('vcloud') || 
                             lowerHeading.includes('v-cloud') || 
                             lowerHeading.includes('vcloud');
                             
            return isVcloud && (
                   lowerHref.includes('nexdrive') || 
                   lowerHref.includes('vgmlink') || 
                   lowerHref.includes('gdflix') || 
                   lowerHref.includes('fastdl') || 
                   lowerHref.includes('filebee') || 
                   lowerHref.includes('hubcloud') || 
                   lowerHref.includes('vcloud') || 
                   lowerHref.includes('katdrive') || 
                   lowerHref.includes('kmhd') || 
                   lowerHref.includes('fastdl.zip')
            );
        });

        console.log(`Found ${validResolutions.length} valid V-Cloud resolution links:\n`);
        
        validResolutions.forEach((res, idx) => {
            console.log(`Resolution ${idx + 1}: ${res.heading || res.text} (${res.resolution})`);
            console.log(`  Href: ${res.href}`);
        });

        if (validResolutions.length === 0) {
            console.log('No valid V-Cloud resolution links found.');
            return;
        }

        // We'll test the first valid resolution option (480p)
        const selectedRes = validResolutions[0];
        console.log(`\n========================================`);
        console.log(`2. Resolving redirect landing links for resolution: ${selectedRes.heading || selectedRes.text}`);
        
        const directHosts = await extractDirectDownloadLinks(selectedRes.href);
        console.log(`Found ${directHosts.length} episode redirect host links:\n`);

        for (let i = 0; i < directHosts.length; i++) {
            const host = directHosts[i];
            console.log(`Episode Host ${i + 1}: ${host.episode || 'Single Movie'} (${host.text})`);
            console.log(`  Redirect Host URL: ${host.href}`);
            
            // Now extract sub-options (10Gbps, FSLv2, FSL) for this landing url
            console.log(`  Extracting final sub-options/direct download links...`);
            try {
                const subOpts = await extractSubOptions(host.href);
                subOpts.forEach(opt => {
                    console.log(`    - Server: "${opt.text}" -> ${opt.href}`);
                });
            } catch(subErr) {
                console.log(`    - Failed to extract sub-options: ${subErr.message}`);
            }
            console.log();
        }

    } catch (e) {
        console.error('Error during scraping:', e.message);
    }
}

checkYouLinks();
