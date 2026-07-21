const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function remuxToFaststartMp4(inputBuffer) {
    const tmpInput = path.join(os.tmpdir(), `yt_in_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp4`);
    const tmpOutput = path.join(os.tmpdir(), `yt_out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.mp4`);
    try {
        fs.writeFileSync(tmpInput, inputBuffer);
        execSync(`ffmpeg -y -i "${tmpInput}" -c copy -movflags +faststart "${tmpOutput}"`, { stdio: 'ignore' });
        const outputBuffer = fs.readFileSync(tmpOutput);
        console.log(`[Remux] Success! In: ${inputBuffer.length} bytes -> Out: ${outputBuffer.length} bytes`);
        return outputBuffer;
    } catch(e) {
        console.error('[Remux] Faststart remux failed, returning original buffer:', e.message);
        return inputBuffer;
    } finally {
        try { if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput); } catch(_) {}
        try { if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch(_) {}
    }
}

const fmp4Buf = fs.readFileSync('test_rick.mp4');
const fixedBuf = remuxToFaststartMp4(fmp4Buf);

console.log('Is fixed buffer valid size?', fixedBuf.length > 1000000);
