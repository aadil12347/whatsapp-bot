const { downloadStreamWithFFmpeg, verifyMediaFile } = require('../src/Utils/streamimdb_scraper');
const path = require('path');

async function testDownload() {
    const m3u8Url = 'https://app.putgate.com/cdnstr/H4sIAAAAAAAAAwXBa2.CMBQA0L.EUh6a7MMYFUMQpI9buN9KW2OkMpdUx_z1OyfLL5M11qXaWaOjiNhpmnKy2cXEZdvkstdVSJgKGpVPmwiaVj5m4YvNGLdxp.oafVHo6lo6HjpRfq5A2Rcu42t848vQhPQqBD7QX1HlK1bhpwV7ZhEjVkABpT33Knme1KFv3iAwpkTO_slvmNpjjeYeoJOtNsMDYV639j4SGPwRFvl3UoGr5XtlfKcdrVEJ.fEP4yEGus0AAAA-/list.m3u8';
    const outputPath = path.join(__dirname, 'test_out.mp4');

    console.log('Starting FFmpeg download of m3u8 stream...');
    await downloadStreamWithFFmpeg(m3u8Url, outputPath, 'https://nextgencloudfabric.com/');
    console.log('Download complete. Verifying file...');

    const verification = await verifyMediaFile(outputPath);
    console.log('Verification result:', verification);
}

testDownload().catch(console.error);
