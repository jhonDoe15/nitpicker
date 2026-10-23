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
    throw new Error(`ruff could not be run as ${ruff}: pass its path as --refresh-ruff=<path>`);
  }
  const snapshot = path.relative(repositoryRoot, fileURLToPath(RUFF_RULES_FILE));
  writeFileSync(
    RUFF_RULES_FILE,
    await formattedText(repositoryRoot, snapshot, JSON.stringify(rules)),
  );
}

async function refreshEslint() {
  const inventory = await liveEslintInventory();
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
    if (!target.startsWith(repositoryRoot + path.sep)) {
      throw new Error(`The generated file ${file} is outside the repository`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

const RUFF_OPTION = /^--refresh-ruff(?:=(.+))?$/u;
const USAGE =
  'Usage: node scripts/gen-rules.mjs [--check] [--refresh-eslint] [--refresh-ruff[=<path>]]\n';

/**
 * Regenerates the rule reference, or with `--check` lists what is stale. `--refresh-ruff[=<path>]`
 * first rewrites the ruff snapshot from that ruff (`ruff` on the PATH by default), and
 * `--refresh-eslint` the ESLint inventory from the preset configs.
 */
export async function main(options, { stderr }) {
  if (
    !options.every(
      (option) => ['--check', '--refresh-eslint'].includes(option) || RUFF_OPTION.test(option),
    )
  ) {
    stderr.write(USAGE);
    return 2;
  }
  const ruffOption = options.map((option) => RUFF_OPTION.exec(option)).find(Boolean);
  if (ruffOption !== undefined) {
    await refreshRuff(ruffOption[1] ?? 'ruff');
  }
  if (options.includes('--refresh-eslint')) {
    await refreshEslint();
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
  process.exitCode = await main(process.argv.slice(2), { stderr: process.stderr });
}
