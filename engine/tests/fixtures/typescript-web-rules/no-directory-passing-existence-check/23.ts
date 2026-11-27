import fs from 'node:fs';
const text = fs.existsSync(args.file) && fs.readFileSync(args.file, "utf8");