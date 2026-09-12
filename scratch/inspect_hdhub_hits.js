const { searchHdhub4u } = require('../src/Utils/movie_scraper');

async function main() {
    const hits = await searchHdhub4u("Superman");
    console.log("HDHub Hits Sample:", JSON.stringify(hits.slice(0, 2), null, 2));
}

main();
