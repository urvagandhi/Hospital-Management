const fs = require('fs');
try {
    const content = fs.readFileSync('response.json', 'utf16le');
    console.log(content);
} catch (err) {
    console.error(err);
}
