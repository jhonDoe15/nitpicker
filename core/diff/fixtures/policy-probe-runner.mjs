import { appendFileSync } from 'node:fs';
import { readHeadPolicy } from '../../../languages/typescript/preset/head-policy.mjs';

const [root, logPath] = process.argv.slice(2);
appendFileSync(logPath, `${JSON.stringify({ root, policy: readHeadPolicy() })}\n`);
process.stdout.write(`${JSON.stringify({ findings: [] })}\n`);
