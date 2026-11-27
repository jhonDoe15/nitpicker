import fs from 'node:fs';
const files = paths.filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, "utf8"));