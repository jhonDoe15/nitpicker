import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formattedReferenceFiles,
  formattedText,
  referenceFiles,
  staleReferenceFiles,
} from '../core/reference/generate.mjs';
import { installedRuffRules } from '../languages/python/reference/ruff-selection.mjs';
import { RUFF_RULES_FILE } from '../languages/python/reference/ruff-entries.mjs';
import {
  eslintInventoryPath,
  liveEslintInventory,
  writeEslintInventory,
} from '../languages/typescript/reference/eslint-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

async function refreshRuff(ruff) {
  const rules = installedRuffRules(ruff);
  if (rules === undefined) {
    throw new Error(`ruff could not be run as ${ruff}: set NITPICKER_RUFF to its path`);
  }
  const snapshot = path.relative(repositoryRoot, fileURLToPath(RUFF_RULES_FILE));
  writeFileSync(
    RUFF_RULES_FILE,
    await formattedText(repositoryRoot, snapshot, JSON.stringify(rules)),
  );
}

async function refreshEslint(environment) {
  const inventory = await liveEslintInventory(environment);
  writeEslintInventory(
    await formattedText(
      repositoryRoot,
      eslintInventoryPath(repositoryRoot),
      JSON.stringify(inventory),
    ),
  );
}

function writeGenerated(generated) {
  for (const [file, text] of generated) {
    const target = path.resolve(repositoryRoot, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

/**
 * Regenerates the rule reference, or with `--check` lists what is stale. `--refresh-ruff` first
 * rewrites the ruff snapshot from the ruff at `NITPICKER_RUFF`, and `--refresh-eslint` the ESLint
 * inventory from the preset configs.
 */
export async function main(options, { environment, stderr }) {
  if (options.includes('--refresh-ruff')) {
    await refreshRuff(environment.NITPICKER_RUFF ?? 'ruff');
  }
  if (options.includes('--refresh-eslint')) {
    await refreshEslint(environment);
  }
  if (!options.includes('--check')) {
    writeGenerated(await formattedReferenceFiles(repositoryRoot));
    return 0;
  }
  const stale = staleReferenceFiles(repositoryRoot, referenceFiles(repositoryRoot));
  if (stale.length > 0) {
    stderr.write(`Stale (run npm run gen:rules): ${stale.join(', ')}\n`);
  }
  return stale.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2), {
    environment: process.env,
    stderr: process.stderr,
  });
}
