import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formattedReferenceFiles,
  formattedText,
  referenceFiles,
  staleReferenceFiles,
} from '../core/reference/generate.mjs';
import {
  installedRuffRules,
  isOlderVersion,
} from '../languages/python/reference/ruff-selection.mjs';
import { readRuffSnapshot, RUFF_RULES_FILE } from '../languages/python/reference/ruff-entries.mjs';
import {
  liveToolText,
  TOOL_TEXT_TOOLS,
  toolTextFile,
} from '../languages/java/reference/tool-text/tool-text.mjs';
import {
  eslintInventoryPath,
  liveEslintInventory,
  writeEslintInventory,
} from '../languages/typescript/reference/eslint-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

async function refreshRuff(ruff, stderr) {
  const snapshot = installedRuffRules(ruff);
  if (snapshot === undefined) {
    throw new Error(`ruff could not be run as ${ruff}: pass its path as --refresh-ruff=<path>`);
  }
  const committed = readRuffSnapshot().version;
  if (committed !== undefined && isOlderVersion(snapshot.version, committed)) {
    stderr.write(
      `Warning: ruff ${snapshot.version} is older than ruff ${committed}, which the committed snapshot comes from; the rules it lacks drop out of the reference.\n`,
    );
  }
  const file = path.relative(repositoryRoot, fileURLToPath(RUFF_RULES_FILE));
  writeFileSync(
    RUFF_RULES_FILE,
    await formattedText(repositoryRoot, file, JSON.stringify(snapshot)),
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

async function refreshJvm() {
  for (const tool of TOOL_TEXT_TOOLS) {
    const file = toolTextFile(tool);
    const snapshot = path.relative(repositoryRoot, fileURLToPath(file));
    writeFileSync(
      file,
      await formattedText(repositoryRoot, snapshot, JSON.stringify(liveToolText(tool))),
    );
  }
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

const FLAGS = ['--check', '--refresh-eslint', '--refresh-jvm'];
const RUFF_OPTION = /^--refresh-ruff(?:=(.+))?$/u;
const USAGE =
  'Usage: node scripts/gen-rules.mjs [--check] [--refresh-eslint] [--refresh-jvm] [--refresh-ruff[=<path>]]\n';

/**
 * Regenerates the rule reference, or with `--check` lists what is stale. `--refresh-ruff[=<path>]`
 * first rewrites the ruff snapshot from that ruff (`ruff` on the PATH by default),
 * `--refresh-eslint` the ESLint inventory from the preset configs, and `--refresh-jvm` the rule
 * texts of the pinned PMD, SpotBugs, Checkstyle, detekt and Error Prone, with Maven and Java.
 */
export async function main(options, { stderr }) {
  if (!options.every((option) => FLAGS.includes(option) || RUFF_OPTION.test(option))) {
    stderr.write(USAGE);
    return 2;
  }
  const ruffOption = options.map((option) => RUFF_OPTION.exec(option)).find(Boolean);
  if (ruffOption !== undefined) {
    await refreshRuff(ruffOption[1] ?? 'ruff', stderr);
  }
  if (options.includes('--refresh-eslint')) {
    await refreshEslint();
  }
  if (options.includes('--refresh-jvm')) {
    await refreshJvm();
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
