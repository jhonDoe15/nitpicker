import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPOSITORY_ROOT } from '../evaluate.mts';
import { repositoryCensus } from './census.mts';

const SCANNED = ['core', 'shared', 'languages'];
const OUTPUT = 'reports/flow-model/census.json';
const root = fileURLToPath(REPOSITORY_ROOT);

const files = execFileSync('git', ['ls-files', ...SCANNED], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);
const census = repositoryCensus(root, files);
const target = path.join(root, OUTPUT);
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(census, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(census, null, 2)}\n`);
