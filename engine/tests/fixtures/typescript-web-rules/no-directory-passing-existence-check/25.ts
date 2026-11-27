import fs from 'node:fs';
for (const file of files) { if (!existsSync(file)) { continue; } const text = readFileSync(file, "utf8"); }