import fs from 'node:fs';
if (existsSync(config.memoryFile)) { rules.add(readFileSync(config.memoryFile, "utf8")); }