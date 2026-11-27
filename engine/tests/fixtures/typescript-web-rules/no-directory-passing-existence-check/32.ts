import fs from 'node:fs';
const files = paths.filter(existsSync).map((p) => readFileSync(p, "utf8"));