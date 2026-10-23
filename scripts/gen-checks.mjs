// Regenerates the parts of the repository that come from shared/policy.mjs (the custom-rules table
// in spec/checks.md and the jscpd mode in languages/typescript/preset/defaults/jscpd.json) and from
// action.yml (the inputs and outputs in docs/ci.md). `--check` writes nothing and exits 1 when a
// file is stale.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyGeneratedBlock, applyJscpdMode } from '../shared/checks-catalog.mjs';
import { applyActionReference } from './action-inputs.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
export const GENERATED_FILES = [
  { file: path.join(repositoryRoot, 'spec/checks.md'), generate: applyGeneratedBlock },
  {
    file: path.join(repositoryRoot, 'languages/typescript/preset/defaults/jscpd.json'),
    generate: applyJscpdMode,
  },
  { file: path.join(repositoryRoot, 'docs/ci.md'), generate: applyActionReference },
];

export function staleFiles() {
  return GENERATED_FILES.filter(
    ({ file, generate }) => generate(readFileSync(file, 'utf8')) !== readFileSync(file, 'utf8'),
  ).map(({ file }) => file);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.includes('--check')) {
    const stale = staleFiles();
    if (stale.length > 0) {
      console.error(`Stale (run npm run gen:checks): ${stale.join(', ')}`);
      process.exitCode = 1;
    }
  } else {
    for (const { file, generate } of GENERATED_FILES) {
      writeFileSync(file, generate(readFileSync(file, 'utf8')));
    }
  }
}
