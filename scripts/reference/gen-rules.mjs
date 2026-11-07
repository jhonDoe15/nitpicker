import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLINT_REGISTRY, eslintRegistrySource } from './eslint-registry.mjs';
import { KOTLIN_SCAN_REGISTRY, kotlinScanRegistrySource } from './kotlin-scan-registry.mjs';
import { pmdRulesetSources } from './pmd-rulesets.mjs';
import {
  installedRuffRules,
  isOlderVersion,
  withSelectedNewerRules,
} from '../../languages/python/reference/ruff-selection.mjs';
import {
  readRuffSnapshot,
  RUFF_RULES_FILE,
} from '../../languages/python/reference/ruff-entries.mjs';
import {
  liveToolText,
  TOOL_TEXT_TOOLS,
  toolTextFile,
} from '../../languages/java/reference/tool-text/tool-text.mjs';
import {
  eslintInventoryPath,
  liveEslintInventory,
  writeEslintInventory,
} from '../../languages/typescript/reference/eslint-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

async function refreshRuff(ruff, { stderr, formattedText }) {
  const snapshot = installedRuffRules(ruff);
  if (snapshot === undefined) {
    throw new Error(`ruff could not be run as ${ruff}: pass its path as --refresh-ruff=<path>`);
  }
  const previous = readRuffSnapshot();
  const committed = previous.version;
  if (committed !== undefined && isOlderVersion(snapshot.version, committed)) {
    stderr.write(
      `Warning: ruff ${snapshot.version} is older than ruff ${committed}, which the committed snapshot comes from; the rules it lacks drop out of the reference.\n`,
    );
  }
  const file = path.relative(repositoryRoot, fileURLToPath(RUFF_RULES_FILE));
  writeFileSync(
    RUFF_RULES_FILE,
    await formattedText(
      repositoryRoot,
      file,
      JSON.stringify(withSelectedNewerRules(snapshot, previous)),
    ),
  );
}

async function refreshEslint({ formattedText }) {
  const inventory = await liveEslintInventory();
  writeEslintInventory(
    await formattedText(
      repositoryRoot,
      eslintInventoryPath(repositoryRoot),
      JSON.stringify(inventory),
    ),
  );
}

async function refreshJvm({ formattedText }) {
  for (const tool of TOOL_TEXT_TOOLS) {
    const file = toolTextFile(tool);
    const snapshot = path.relative(repositoryRoot, fileURLToPath(file));
    writeFileSync(
      file,
      await formattedText(repositoryRoot, snapshot, JSON.stringify(liveToolText(tool))),
    );
  }
}

function replaceFile(temporary, target) {
  try {
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    if (error.code !== 'EPERM' || !existsSync(target)) {
      throw error;
    }
  }
}

function writeGenerated(generated) {
  for (const [file, text] of generated) {
    const target = path.resolve(repositoryRoot, file);
    if (!target.startsWith(repositoryRoot + path.sep)) {
      throw new Error(`The generated file ${file} is outside the repository`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = path.resolve(repositoryRoot, `${file}.${String(process.pid)}.tmp`);
    if (!temporary.startsWith(repositoryRoot + path.sep)) {
      throw new Error(`The generated file ${file} is outside the repository`);
    }
    writeFileSync(temporary, text);
    replaceFile(temporary, target);
  }
}

const FLAGS = ['--check', '--data', '--refresh-eslint', '--refresh-jvm'];
const RUFF_OPTION = /^--refresh-ruff(?:=(.+))?$/u;
const USAGE =
  'Usage: node scripts/reference/gen-rules.mjs [--check | --data] [--refresh-eslint] [--refresh-jvm] [--refresh-ruff[=<path>]]\n';

async function refreshSnapshots(options, context) {
  const ruffOption = options.map((option) => RUFF_OPTION.exec(option)).find(Boolean);
  if (ruffOption !== undefined) {
    await refreshRuff(ruffOption[1] ?? 'ruff', context);
  }
  if (options.includes('--refresh-eslint')) {
    await refreshEslint(context);
  }
  if (options.includes('--refresh-jvm')) {
    await refreshJvm(context);
  }
}

function writeRequested(options, reference) {
  if (options.includes('--data')) {
    writeGenerated(reference.referenceDataFiles(repositoryRoot));
    return 0;
  }
  writeGenerated(reference.referenceFiles(repositoryRoot));
  return 0;
}

function reportStale(registry, reference, stderr) {
  const generated = new Map([...registry, ...reference.referenceFiles(repositoryRoot)]);
  const stale = reference.staleReferenceFiles(repositoryRoot, generated);
  if (stale.length > 0) {
    stderr.write(`Stale (run npm run gen:rules): ${stale.join(', ')}\n`);
  }
  return stale.length === 0 ? 0 : 1;
}

/**
 * Regenerates the plugin rule map, the Kotlin scan module list, the PMD rulesets and the reference.
 * `--check` lists what is stale, `--data` writes only the built, uncommitted data files.
 * `--refresh-ruff[=<path>]`, `--refresh-eslint` and `--refresh-jvm` first rewrite the ruff
 * snapshot, the ESLint inventory, and the texts of the pinned JVM tools.
 */
export async function main(options, { stderr }) {
  if (!options.every((option) => FLAGS.includes(option) || RUFF_OPTION.test(option))) {
    stderr.write(USAGE);
    return 2;
  }
  const registry = new Map([
    [ESLINT_REGISTRY, await eslintRegistrySource(repositoryRoot)],
    [KOTLIN_SCAN_REGISTRY, await kotlinScanRegistrySource(repositoryRoot)],
    ...pmdRulesetSources(repositoryRoot),
  ]);
  if (!options.includes('--check') && !options.includes('--data')) {
    writeGenerated(registry);
  }
  const reference = await import('../../core/reference/generate.mjs');
  await refreshSnapshots(options, { stderr, formattedText: reference.formattedText });
  return options.includes('--check')
    ? reportStale(registry, reference, stderr)
    : writeRequested(options, reference);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2), { stderr: process.stderr });
}
