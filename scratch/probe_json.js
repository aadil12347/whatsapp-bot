const { execSync } = require('child_process');

const videoStream = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,pix_fmt,width,height -show_entries format=format_name -of json "test_rick.mp4"`).toString();
console.log('Video stream:', JSON.stringify(JSON.parse(videoStream), null, 2));

const audioStream = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,profile,sample_rate,channels -of json "test_rick.mp4"`).toString();
console.log('Audio stream:', JSON.stringify(JSON.parse(audioStream), null, 2));
