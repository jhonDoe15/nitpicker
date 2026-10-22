import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formattedText,
  generatedReferenceFiles,
  staleReferenceFiles,
} from '../core/reference/generate.mjs';
import { installedRuffRules } from '../languages/python/reference/ruff-selection.mjs';
import { RUFF_RULES_FILE } from '../languages/python/reference/ruff-entries.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

/** Regenerates the rule reference, or with `--check` lists what is stale; `--refresh-ruff` first rewrites the ruff snapshot. */
export async function main(arguments_) {
  if (arguments_.includes('--refresh-ruff')) {
    const rules = installedRuffRules();
    if (rules === undefined) {
      throw new Error('ruff is not installed: set NITPICKER_RUFF to its path');
    }
    const snapshot = path.relative(repositoryRoot, fileURLToPath(RUFF_RULES_FILE));
    writeFileSync(
      RUFF_RULES_FILE,
      await formattedText(repositoryRoot, snapshot, JSON.stringify(rules)),
    );
  }
  const generated = await generatedReferenceFiles(repositoryRoot);
  if (arguments_.includes('--check')) {
    const stale = await staleReferenceFiles(repositoryRoot, generated);
    if (stale.length > 0) {
      console.error(`Stale (run npm run gen:rules): ${stale.join(', ')}`);
      return 1;
    }
    return 0;
  }
  for (const [file, text] of generated) {
    mkdirSync(path.dirname(path.join(repositoryRoot, file)), { recursive: true });
    writeFileSync(path.join(repositoryRoot, file), text);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
