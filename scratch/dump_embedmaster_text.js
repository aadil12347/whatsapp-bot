const axios = require('axios');
const cheerio = require('cheerio');

async function dumpEmbedmasterComText() {
    const res = await axios.get('https://embedmaster.com/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    });
    const $ = cheerio.load(res.data);
    
    // Dump text inside code tags or pre tags or input fields or text blocks
    console.log('=== All Code / Pre / Inputs / Spans / Paragraphs ===');
    $('code, pre, input, span, td, div').each((i, el) => {
        const text = $(el).text().trim();
        const value = $(el).val() || $(el).attr('value') || '';
        if ((text && (text.includes('http') || text.includes('embed') || text.includes('movie') || text.includes('tv') || text.includes('iframe'))) ||
            (value && (value.includes('http') || value.includes('embed') || value.includes('movie') || value.includes('tv') || value.includes('iframe')))) {
            console.log(`[${el.tagName}] text:`, text, '| value:', value);
        }
    });

    console.log('\n=== All links (a href) ===');
    $('a').each((i, el) => {
        console.log($(el).attr('href'), '|', $(el).text().trim());
    });
}

dumpEmbedmasterComText().catch(console.error);
