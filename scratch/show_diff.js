const { execSync } = require('child_process');
const diff = execSync('git diff 0d70c4e7f4a32557f272252ff4b91b554dc4d313~1..0d70c4e7f4a32557f272252ff4b91b554dc4d313 queen.js', { encoding: 'utf8' });
console.log(diff);
