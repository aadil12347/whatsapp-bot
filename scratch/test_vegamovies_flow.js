const scraper = require('../src/Utils/movie_scraper');

async function verifyFlow() {
    console.log('--- VERIFYING VEGAMOVIES SCRAPER FUNCTIONS ---');
    try {
        console.log('1. Testing scrapeAllPostLinks on Vikings series...');
        const url = 'https://vegamovies.navy/download-vikings-valhalla-s03-2024-complete-hindi-english-netflix-series-480p-720p-1080p-web-dl/';
        const links = await scraper.scrapeAllPostLinks(url);
        console.log(`Parsed ${links.length} total links.`);
        
        const validLinks = links.filter(l => {
            const lowerHref = l.href.toLowerCase();
            return lowerHref.includes('nexdrive') || 
                   lowerHref.includes('vgmlink') || 
                   lowerHref.includes('gdflix') || 
                   lowerHref.includes('fastdl') || 
                   lowerHref.includes('filebee') || 
                   lowerHref.includes('hubcloud') || 
                   lowerHref.includes('vcloud') || 
                   lowerHref.includes('katdrive') || 
                   lowerHref.includes('kmhd') || 
                   lowerHref.includes('fastdl.zip');
        });
        console.log(`Filtered down to ${validLinks.length} valid redirect links:`);
        validLinks.forEach((vl, idx) => {
            console.log(`  Link ${idx + 1}: ${vl.heading || vl.text} (${vl.resolution}) -> ${vl.href}`);
        });

        // Choose the nexdrive link for 720p Season 3 Pack
        const targetLink = validLinks.find(l => l.text.toLowerCase().includes('720p') && l.href.includes('nexdrive')) || validLinks[0];
        
        if (targetLink) {
            console.log(`\n2. Testing extractDirectDownloadLinks on selected link: ${targetLink.heading || targetLink.text}`);
            const hosts = await scraper.extractDirectDownloadLinks(targetLink.href);
            console.log(`Parsed ${hosts.length} direct host download links:`);
            hosts.forEach((h, idx) => {
                console.log(`  Host ${idx + 1}: ${h.text} [Episode: "${h.episode || 'N/A'}"] -> ${h.href}`);
            });
            
            // Filter options to only FSL, FSLv2, GDrive (G-Direct, Fastdl, Filepress), 10gbps
            const filteredOptions = hosts.filter(host => {
                const parentLower = host.text.toLowerCase();
                const textLower = host.text.toLowerCase();
                
                // Matches FSL/V-Cloud
                const matchesFsl = parentLower.includes('v-cloud') || parentLower.includes('vcloud') || textLower.includes('fsl') || textLower.includes('vcloud') || textLower.includes('v-cloud');
                // Matches GDrive (fastdl, filepress, g-direct, filebee, etc.)
                const matchesGdrive = parentLower.includes('g-direct') || parentLower.includes('filepress') || parentLower.includes('gdrive') || parentLower.includes('fastdl') || parentLower.includes('filebee') || textLower.includes('gdrive') || textLower.includes('drive') || textLower.includes('fastdl') || textLower.includes('filepress');
                // Matches 10gbps
                const matches10gbps = parentLower.includes('10gbps') || textLower.includes('10gbps');
                
                return matchesFsl || matchesGdrive || matches10gbps;
            });
            
            console.log(`\nFiltered down to ${filteredOptions.length} supported host options:`);
            filteredOptions.forEach((h, idx) => {
                console.log(`  Filtered Host ${idx + 1}: ${h.text} [Episode: "${h.episode || 'N/A'}"]`);
            });
        }
        console.log('\n--- VERIFICATION COMPLETED ---');
    } catch(e) {
        console.error('Verification failed:', e.message);
        process.exit(1);
    }
}

verifyFlow();
