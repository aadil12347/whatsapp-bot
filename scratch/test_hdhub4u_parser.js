function parseEpisodeFromAllContexts(linkText, parentText, precedingHeading, href) {
    const combined = `${linkText} ${parentText} ${precedingHeading}`;
    
    // 1. Try regex on combined text
    let epMatch = combined.match(/\b(?:E|EP|Episode|EPiSODE)\s*[:\-–—]?\s*(\d+)\b/i);
    if (epMatch) {
        const epNum = parseInt(epMatch[1], 10);
        return `E${String(epNum).padStart(2, '0')}`;
    }

    // 2. Try checking base64 q parameter in hubcloud search-recover links
    if (href && href.includes('q=')) {
        try {
            const parsed = new URL(href);
            const qVal = parsed.searchParams.get('q');
            if (qVal) {
                const decoded = Buffer.from(qVal, 'base64').toString('utf8');
                const decodedMatch = decoded.match(/\b(?:E|EP|Episode)\s*[:\-–—]?\s*(\d+)\b/i);
                if (decodedMatch) {
                    const epNum = parseInt(decodedMatch[1], 10);
                    return `E${String(epNum).padStart(2, '0')}`;
                }
            }
        } catch (_) {}
    }

    return null;
}

// Test on HDHub4u Link 7:
const ep1 = parseEpisodeFromAllContexts("Drive", "Drive | Instant | WATCH", "EPiSODE 1", "https://hubcloud.foo/drive/search-recover.php?from_ac=PNdnP0r8IhLA3xeJ9ta0UhkU4__GYN_h-iyUKC73USWZwIxH&q=VHJpZ2dlciBTMDEgRXBpc29kZSAxIDcyMHA");
console.log("Link 7 Episode:", ep1);

// Test on HDHub4u Link 11:
const ep2 = parseEpisodeFromAllContexts("Drive", "Drive | Instant | WATCH", "EPiSODE 2", "https://hubcloud.foo/drive/search-recover.php?from_ac=...&q=VHJpZ2dlciBTMDEgRXBpc29kZSAyIDcyMHA");
console.log("Link 11 Episode:", ep2);
