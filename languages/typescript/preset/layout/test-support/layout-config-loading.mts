import {
  type Policy,
  type VitestConfig,
  resolveHeadPolicy,
  type VitestConfigFactory,
  resolveLayout,
} from './layout-views.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { onTestFinished, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { containedPath as untypedContainedPath } from '../../../../../core/fix/common/contained-path.mjs';

const sourcePath: (file: string) => string = checkoutModulePath;
const containedPath: (root: string, name: string) => string = untypedContainedPath;

export const defaults = path.join(fileURLToPath(new URL('../../', import.meta.url)), 'defaults');

export const customPolicy: Policy = {
  exclude: ['lib/legacy/**'],
  react: { enabled: false },
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
};

export const customLayout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, [
  'lib/legacy/**',
]);

export function trackTemporaryRoot(root: string): void {
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

export function readDefault(name: string): unknown {
  return parseJson(readFileSync(containedPath(defaults, name), 'utf8'));
}

function isVitestFactory(value: unknown): value is VitestConfigFactory {
  return typeof value === 'function';
}

function vitestFactoryOf(module: object): VitestConfigFactory {
  const factory: unknown = Reflect.get(module, 'default');
  if (!isVitestFactory(factory)) {
    throw new TypeError('The vitest config does not export a factory');
  }
  return factory;
}

export async function loadConfig<Result>(
  relativePath: string,
  policy: Policy | undefined,
  read: (module: object) => Result,
): Promise<Result> {
  setPolicyEnvironment(policy);
  const url = pathToFileURL(
    sourcePath(path.join(fileURLToPath(new URL('../../', import.meta.url)), relativePath)),
  );
  url.search = `policy=${randomUUID()}`;
  const loaded: unknown = await import(url.href);
  if (typeof loaded !== 'object' || loaded === null) {
    throw new TypeError(`${relativePath} does not load as a module`);
  }
  return read(loaded);
}

export function temporaryProject(files: Readonly<Record<string, string>>): string {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-'));
  trackTemporaryRoot(projectRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(containedPath(projectRoot, name), text);
  }
  return projectRoot;
}

export async function resolveVitestConfig(
  relativePath: string,
  policy: Policy | undefined,
  projectFiles: Readonly<Record<string, string>> = {},
): Promise<VitestConfig> {
  const config = await loadConfig(relativePath, policy, vitestFactoryOf);
  const projectRoot = temporaryProject(projectFiles);
  const previousDirectory = process.cwd();
  process.chdir(projectRoot);
  try {
    return await config({ command: 'serve', mode: 'test' });
  } finally {
    process.chdir(previousDirectory);
  }
}

function setPolicyEnvironment(policy: Policy | undefined): void {
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  if (policy === undefined) {
    vi.stubEnv('NITPICKER_POLICY', undefined);
    return;
  }
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-config-'));
  trackTemporaryRoot(root);
  const policyFile = path.join(root, 'policy.json');
  const { frameworks } = policy;
  writeFileSync(policyFile, JSON.stringify({ ...resolveHeadPolicy(policy), frameworks }));
  vi.stubEnv('NITPICKER_POLICY', policyFile);
}
