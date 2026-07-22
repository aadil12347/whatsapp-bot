const { downloadStreamWithFFmpeg, verifyMediaFile } = require('../src/Utils/streamimdb_scraper');
const path = require('path');

async function testDownload() {
    const m3u8Url = 'https://scalablecontentengine.site/8DZ5WpsK6/pl/H4sIAAAAAAAAAwXBXVeDIBgA4L8EbCzpckdlx5IFAn7cCa87JlrL2Nb89T3PQPABe3o5HCgZHMM48YwyQnuAF5TsL6.QSiIy1bjpmANSd1fHe4ezVc7zj0pVUGlGvR4fjhdbucGuS4_SfcZ8yFioNigr2z1gKahEKrQT1LUpNr8JUs5j7gmj7.T6pheK3bJHtcGTrzt55kKYU0Etz1ajZ3E.jVdoxlvN42Ssij2PW4eSp1tG4q2ngISFOdDe4A8fogBdtGJX3qXJe2Pnygd7kCHuOgT7YWHfZap0_0xQt9loJxV9DpXhcGxDbkUQtjfsphFe6.D_hqbQ_WS54uzLzeNqgkLQtMSYXyI1Yv_xw5TRQQEAAA--/master.m3u8';
    const outputPath = path.join(__dirname, 'test_out.mp4');

    console.log('Starting FFmpeg download of m3u8 stream 1...');
    await downloadStreamWithFFmpeg(m3u8Url, outputPath, 'https://nextgencloudfabric.com/');
    console.log('Download complete. Verifying file...');

    const verification = await verifyMediaFile(outputPath);
    console.log('Verification result:', verification);
}

testDownload().catch(console.error);
