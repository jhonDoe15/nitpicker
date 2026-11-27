import fs from 'node:fs';
files.forEach((file) => { if (fs.existsSync(file)) { read(fs.readFileSync(file)); } });