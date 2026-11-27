import fs from 'node:fs';
function load(filePath) { if (fs.existsSync(filePath)) { return fs.readFileSync(filePath, "utf8"); } }