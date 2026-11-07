import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { markedLine, markedPayload } from '../../../../core/tooling/child-output.mjs';
import { chainOf } from '../../../../shared/traversal.mjs';
import { aliasesFromConfig } from './aliases.mjs';
import { environmentsFromConfig } from './environments.mjs';

export const RESULT_MARKER = 'NITPICKER_TEST_ENVIRONMENT_RESULT ';
const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

function entryOf(manifest) {
  const entry = manifest.exports?.['.'];
  const imported = entry?.import ?? entry;
  const resolved = typeof imported === 'string' ? imported : imported?.default;
  return resolved ?? manifest.module ?? manifest.main ?? 'index.js';
}

function parentDirectory(directory) {
  const parent = path.dirname(directory);
  return parent === directory ? undefined : parent;
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

function serializedRetry(retry) {
  if (typeof retry !== 'object' || retry === null || retry.condition === undefined) {
    return retry;
  }
  const { condition } = retry;
  return {
    ...retry,
    condition:
      condition instanceof RegExp
        ? { source: condition.source, flags: condition.flags }
        : { type: typeof condition },
  };
}

function projectRetries(config) {
  const entries = Array.isArray(config?.test?.projects) ? config.test.projects : [];
  const retries = entries.flatMap((entry, index) => {
    const retry = entry?.test?.retry;
    return retry === undefined
      ? []
      : [{ name: entry.test.name ?? `#${String(index + 1)}`, retry: serializedRetry(retry) }];
  });
  return retries.length === 0 ? {} : { projectRetries: retries };
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
    ...environmentsFromConfig(config, projectRoot),
    aliases: aliasesFromConfig(config, projectRoot),
    retry: serializedRetry(config?.test?.retry),
    ...projectRetries(config),
  };
}

async function main(argumentsList) {
  const [configFile, projectRoot, ...resolveRoots] = argumentsList;
  try {
    const result = await readEnvironment({ configFile, projectRoot, resolveRoots });
    process.stdout.write(markedLine(RESULT_MARKER, { result }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stdout.write(markedLine(RESULT_MARKER, { failure: reason }));
  }
  process.exit(0);
}

export function readConfigInChild({
  configFile,
  projectRoot,
  resolveRoots,
  timeoutMs = TIMEOUT_MS,
}) {
  const result = spawnSync(
    process.execPath,
    [import.meta.filename, configFile, projectRoot, ...resolveRoots],
    {
      cwd: projectRoot,
      env: { ...process.env, VITEST: 'true', NODE_ENV: 'test' },
      encoding: 'utf8',
      input: '',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    },
  );
  if (result.error?.code === 'ETIMEDOUT') {
    return { failure: `it did not finish within ${String(timeoutMs)} ms` };
  }
  if (result.error !== undefined) {
    return { failure: result.error.message };
  }
  return (
    markedPayload(result.stdout, RESULT_MARKER) ?? {
      failure: `the config ended the process with exit code ${String(result.status)}`,
    }
  );
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  await main(process.argv.slice(2));
}
