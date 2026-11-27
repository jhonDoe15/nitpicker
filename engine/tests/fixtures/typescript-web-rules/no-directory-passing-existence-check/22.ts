import fs from 'node:fs';
const text = fs.existsSync(settings.file) ? fs.readFileSync(settings.file, "utf8") : "";