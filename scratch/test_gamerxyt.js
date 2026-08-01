const axios = require('axios');
const cheerio = require('cheerio');

async function testGamerxyt() {
    const url = 'https://gamerxyt.com/dl.php?link=https://video-downloads.googleusercontent.com/ADGPM2m8DdBpQ_4n7m5txqrRqs-OdaFHekgIQip7XsEA1tViVnt7EySRcOeRMWSYAQvebomP_OFw2BxxAbHw46-WPKPmJ0Z7mdH_jnrdN8VFLtjWQkxx-lUXv8HGSPF9VAJcjKHg1y96Cd7ncAMXzQbj4Ep_neR8fAjLuANt3MQTxyMTNNa-Ws0t5kj66MQFAkWVSnPApgo1gPEzkqWka8hSMmQGSB6vZL-Ze7J6AX4V5W6nW9KybbcsA7gTTtLciUMbjZJjWZH7BhHjZRGXltPyzteeohi1XbZ09waH0V34NbUDpNoDGNuRn_Qbi0p76j1q7-0QJRevZOvQ8egQJJZ5pyR_RN71r_BRWEfTMpiTeYuXGqcLG2-a_GNdhMjOPQC-dwekiTBOTMkxUZF1QqrJ1uAeyGYyGBA7F1BKKzoXRVd7zuInyXL6Xs2AYI38D0B_6gIgCXsl-s7-BVnPkYiBjoqRXkkDvXeP3SGMJOiPEDwgPnmiEtSTnPDv9Rj83nMPjauNDeYAlPzNc8h9-nlae7E29pKJtvlrQ9muZI1tD9FwsyP-fdsK_BgO_XQNuwz2DKdlouAvdJZdErdJnRR521cXXNzbwAcbRQqQTD7QtXq78Lpffk8b_wmaN3U72aKzVX6T9TDrtEssYzBFD24MQpgtQuIHKa8jM93wFJN4bqvZs0kCDomslSRFdCQ-dOfAn5b7zQYjvsMEveINjVpXPV1g2lKZtVwrDmBr_V-TEVt7lBPDBw2ptfNHUyRPhxO2hEI8H-2n0CEItdZwoOAp2sgulkgHg_SMQLM-FK4dsHEEvdL6VrCWAvAihmQJNnNXey6dR_FkAz6WRqQznJmVayBQjhnxHVqO64URU6nUUytocbGBGQ_RcWWKW3Cd02r6D41fM4EXJzDz8AYw2IIwBhuk8FRUAz4Z2WC8k9fJTBppF_dfFV4YIq6qL8drCG-uHeWy5DhXbLtJ1jxnyJnPHzZxCazlnZUBlVdRcww0ekI3KUu3O4xw5Jzt5TYTAIq4AfZ0g0vrqGvAws23v8C7djV4hYqf8Yak3pKRrmxnG3Rrq42SE223DP3vYkDiBJ5k6x4O_24_';

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 15000
        });
        const $ = cheerio.load(res.data);
        console.log('Gamerxyt Page Title:', $('title').text().trim());

        $('a[href]').each((i, el) => {
            console.log(`  Link ${i+1}: [${$(el).text().trim()}] -> ${$(el).attr('href')}`);
        });

    } catch (e) {
        console.error('Gamerxyt test error:', e.message);
    }
}

testGamerxyt();
