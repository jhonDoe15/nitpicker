import fs from 'node:fs';
function f() { if (!fs.existsSync(options.file)) { return null; } return fs.readFileSync(options.file, "utf8"); }