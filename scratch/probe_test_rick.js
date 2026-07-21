const { execSync } = require('child_process');

try {
    const videoStream = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt,width,height -show_entries format=format_name -of json "test_rick.mp4"`).toString();
    console.log('Video stream:', JSON.parse(videoStream));

    const audioStream = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,profile,sample_rate,channels -of json "test_rick.mp4"`).toString();
    console.log('Audio stream:', JSON.parse(audioStream));

    // Check if moov atom is at the beginning (faststart) or end
    const trace = execSync(`ffprobe -v trace "test_rick.mp4" 2>&1 | findstr /i "type:'moov' type:'mdat'"`).toString();
    console.log('Atom order:\n', trace);
} catch(e) {
    console.error('Probe error:', e.message);
}
