import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  fieldOf,
  listOf,
  messageOf,
  parseJson,
  textOf,
} from '../../../../shared/values/readers.mts';
import { chainOf, loadInChild, loaderScript, parentDirectory } from './typed/child-views.mts';
import type { EnvironmentRead, ReadRequest } from './typed/environment-types.mts';
import { aliasesFromConfig } from './aliases.mts';
import { environmentsFromConfig, testFilesFromConfig } from './environments.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mjs';

const READ_SCRIPT = loaderScript(
  "process.env.VITEST = 'true';",
  "process.env.NODE_ENV = 'test';",
  `const { readEnvironment } = await import(${JSON.stringify(import.meta.url)});`,
  'const [configFile, projectRoot, ...resolveRoots] = process.argv.slice(1);',
  'report({ value: await readEnvironment({ configFile, projectRoot, resolveRoots }) });',
);

function entryOf(manifest: unknown): string {
  const entry = fieldOf(fieldOf(manifest, 'exports'), '.');
  const imported = fieldOf(entry, 'import') ?? entry;
  const resolved = typeof imported === 'string' ? imported : fieldOf(imported, 'default');
  return textOf(resolved ?? fieldOf(manifest, 'module') ?? fieldOf(manifest, 'main') ?? 'index.js');
}

function installedManifest(root: string, name: string): string | undefined {
  return chainOf(root, parentDirectory)
    .map((directory) => path.join(directory, 'node_modules', name, 'package.json'))
    .find((candidate) => existsSync(candidate));
}

function viteBesideVitest(root: string): string | undefined {
  const vitestManifest = installedManifest(root, 'vitest');
  if (vitestManifest === undefined) {
    return undefined;
  }
  return installedManifest(path.dirname(realpathSync(vitestManifest)), 'vite');
}

function viteManifestFrom(root: string): string {
  const manifestPath = viteBesideVitest(root) ?? installedManifest(root, 'vite');
  if (manifestPath === undefined) {
    throw troubleshootingError(
      `vite is not installed at or above ${root}, nor beside its vitest`,
      TROUBLESHOOTING_ANCHORS.missingPeer,
    );
  }
  return manifestPath;
}

function viteEntryFrom(root: string): string {
  const manifestPath = viteManifestFrom(root);
  const manifest = parseJson(readFileSync(manifestPath, 'utf8'));
  return pathToFileURL(path.join(path.dirname(manifestPath), entryOf(manifest))).href;
}

async function loadVite(roots: readonly string[]): Promise<unknown> {
  const failures: string[] = [];
  for (const root of roots) {
    try {
      const vite: unknown = await import(viteEntryFrom(root));
      return vite;
    } catch (error) {
      failures.push(messageOf(error));
    }
  }
  throw troubleshootingError(
    `vite could not be resolved from the project (${failures.join('; ')})`,
    TROUBLESHOOTING_ANCHORS.missingPeer,
  );
}

function serializedRetry(retry: unknown): unknown {
  const condition = fieldOf(retry, 'condition');
  if (typeof retry !== 'object' || retry === null || condition === undefined) {
    return retry;
  }
  return {
    ...retry,
    condition:
      condition instanceof RegExp
        ? { source: condition.source, flags: condition.flags }
        : { type: typeof condition },
  };
}

function projectRetries(config: unknown): Pick<EnvironmentRead, 'projectRetries'> {
  const entries = listOf(fieldOf(fieldOf(config, 'test'), 'projects'));
  const retries = entries.flatMap((entry, index) => {
    const test = fieldOf(entry, 'test');
    const retry = fieldOf(test, 'retry');
    return retry === undefined
      ? []
      : [{ name: fieldOf(test, 'name') ?? `#${String(index + 1)}`, retry: serializedRetry(retry) }];
  });
  return retries.length === 0 ? {} : { projectRetries: retries };
}

export async function readEnvironment({
  configFile,
  projectRoot,
  resolveRoots,
}: ReadRequest): Promise<EnvironmentRead> {
  const vite = await loadVite(resolveRoots);
  const loadConfigFromFile = fieldOf(vite, 'loadConfigFromFile');
  if (typeof loadConfigFromFile !== 'function') {
    throw new TypeError('vite does not export loadConfigFromFile');
  }
  const loaded: unknown = await Reflect.apply(loadConfigFromFile, vite, [
    { command: 'serve', mode: 'test' },
    configFile,
    projectRoot,
  ]);
  const config = fieldOf(loaded, 'config');
  return {
    environments: {
      ...environmentsFromConfig(config, projectRoot),
      aliases: aliasesFromConfig(config, projectRoot),
    },
    testFiles: testFilesFromConfig(config, projectRoot),
    retry: serializedRetry(fieldOf(fieldOf(config, 'test'), 'retry')),
    ...projectRetries(config),
  };
}

export function readConfigInChild({
  configFile,
  projectRoot,
  resolveRoots,
  timeoutMs,
}: ReadRequest & { readonly timeoutMs?: number | undefined }): unknown {
  return loadInChild({
    script: READ_SCRIPT,
    args: [configFile, projectRoot, ...resolveRoots],
    name: path.relative(projectRoot, configFile).split(path.sep).join('/'),
    projectRoot,
    timeoutMs,
  });
}
