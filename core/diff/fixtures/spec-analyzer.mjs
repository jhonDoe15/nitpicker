import { readFileSync } from 'node:fs';
import path from 'node:path';

const [root, name] = [process.argv[3], process.argv[5]];
const specs = JSON.parse(readFileSync(path.join(root, 'analyzer.json'), 'utf8'));
process.stdout.write(`${JSON.stringify({ findings: specs[name] ?? [] })}\n`);
