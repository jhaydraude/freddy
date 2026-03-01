const fs = require('fs');
let fileContent = fs.readFileSync('trace/trace.json', 'utf8').trim();
if (!fileContent.endsWith(']')) {
    if (fileContent.endsWith(',')) {
        fileContent = fileContent.slice(0, -1);
    }
    fileContent += ']';
}
const trace = JSON.parse(fileContent);

const events = trace.filter(x => x.ph === 'X' && x.dur);
events.sort((a, b) => b.dur - a.dur);

console.log("TOP 10 SLOWEST EVENTS:");
events.slice(0, 10).forEach(x => {
    console.log(`- ${x.name} | ${x.dur / 1000}ms | ${JSON.stringify(x.args).substring(0, 200)}`);
});
