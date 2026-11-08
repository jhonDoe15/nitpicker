import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chainOf } from '../../../../shared/traversal.mjs';
import { loadInChild, loaderScript } from '../project-configs/config-module.mjs';
import { aliasesFromConfig } from './aliases.mjs';
import { environmentsFromConfig } from './environments.mjs';

const READ_SCRIPT = loaderScript(
  `const { readEnvironment } = await import(${JSON.stringify(import.meta.url)});`,
  'const [configFile, projectRoot, ...resolveRoots] = process.argv.slice(1);',
  'report({ value: await readEnvironment({ configFile, projectRoot, resolveRoots }) });',
);

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

export function readConfigInChild({ configFile, projectRoot, resolveRoots, timeoutMs }) {
  return loadInChild({
    script: READ_SCRIPT,
    args: [configFile, projectRoot, ...resolveRoots],
    name: path.relative(projectRoot, configFile).split(path.sep).join('/'),
    projectRoot,
    timeoutMs,
    env: { VITEST: 'true', NODE_ENV: 'test' },
  });
}
