#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { requiredText } from '../../scripts/json/fields.mts';

const output = requiredText(process.argv[process.argv.indexOf('--output') + 1], '--output');
const sources = ['src/main', 'test']
  .flatMap((directory) =>
    readdirSync(directory).map((name) => readFileSync(path.join(directory, name), 'utf8')),
  )
  .join('\n');

const exit = sources.includes('BREAK_GATE') ? 2 : sources.includes('FORMAT_ME') ? 1 : 0;
mkdirSync(output, { recursive: true });
writeFileSync(
  path.join(output, 'summary.json'),
  JSON.stringify({
    overallStatus: exit === 2 ? 'failed' : 'completed',
    policyHash: 'fake-hash',
  }),
);
console.log(exit === 1 ? 'src/main/math.ts: format this (FORMAT_ME)' : 'ok');
process.exit(exit);
