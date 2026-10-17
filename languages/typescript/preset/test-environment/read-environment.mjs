import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chainOf, parentDirectory } from '../../../../shared/traversal.mjs';
import { loadedMochaOptions } from '../test-runner/test-files/mocha-options.mjs';
import { aliasesFromConfig } from './aliases.mjs';
import { environmentsFromConfig, testFilesFromConfig } from './environments.mjs';

export const RESULT_MARKER = 'NITPICKER_TEST_ENVIRONMENT_RESULT ';
export const MOCHA_MODE = '--mocha-options';

function entryOf(manifest) {
  const entry = manifest.exports?.['.'];
  const imported = entry?.import ?? entry;
  const resolved = typeof imported === 'string' ? imported : imported?.default;
  return resolved ?? manifest.module ?? manifest.main ?? 'index.js';
}

function viteManifestFrom(root) {
  const manifestPath = chainOf(root, parentDirectory)
    .map((directory) => path.join(directory, 'node_modules/vite/package.json'))
    .find((candidate) => existsSync(candidate));
  if (manifestPath === undefined) throw new Error(`vite is not installed at or above ${root}`);
  return manifestPath;
}

function viteEntryFrom(root) {
  const manifestPath = viteManifestFrom(root);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return pathToFileURL(path.join(path.dirname(manifestPath), entryOf(manifest))).href;
}

async function loadVite(roots) {
  const failures = [];
  for (const root of roots) {
    try {
      return await import(viteEntryFrom(root));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`vite could not be resolved from the project (${failures.join('; ')})`);
}

export async function readEnvironment({ configFile, projectRoot, resolveRoots }) {
  const vite = await loadVite(resolveRoots);
  const loaded = await vite.loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    configFile,
    projectRoot,
  );
  const config = loaded?.config;
  return {
    environments: {
      ...environmentsFromConfig(config, projectRoot),
      aliases: aliasesFromConfig(config, projectRoot),
    },
    testFiles: testFilesFromConfig(config, projectRoot),
  };
}

function readMocha([projectRoot, liveProjectRoot, ...tokens]) {
  return loadedMochaOptions({ projectRoot, liveProjectRoot, tokens });
}

function readVite([configFile, projectRoot, ...resolveRoots]) {
  return readEnvironment({ configFile, projectRoot, resolveRoots });
}

async function main([mode, ...rest]) {
  try {
    const result = await (mode === MOCHA_MODE ? readMocha(rest) : readVite([mode, ...rest]));
    process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify({ result })}\n`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify({ failure: reason })}\n`);
  }
  process.exit(0);
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  await main(process.argv.slice(2));
}
