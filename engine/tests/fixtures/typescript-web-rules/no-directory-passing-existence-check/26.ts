import fs from 'node:fs';
for (const file of files) { if (fs.existsSync(file)) { total += fs.readFileSync(file).length; } }