import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chainOf, parentDirectory } from '../../../../shared/traversal.mjs';
import { aliasesFromConfig } from './aliases.mjs';
import { environmentsFromConfig, testFilesFromConfig } from './environments.mjs';

export const RESULT_MARKER = 'NITPICKER_TEST_ENVIRONMENT_RESULT ';

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

async function main(argumentsList) {
  const [configFile, projectRoot, ...resolveRoots] = argumentsList;
  try {
    const result = await readEnvironment({ configFile, projectRoot, resolveRoots });
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
