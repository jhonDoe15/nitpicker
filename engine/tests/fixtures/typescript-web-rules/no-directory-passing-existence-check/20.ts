import fs from 'node:fs';
if (fs.existsSync(options.ignorePath)) { rules.add(fs.readFileSync(options.ignorePath, "utf8")); }