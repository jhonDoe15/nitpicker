import {
  type Policy,
  type VitestConfig,
  resolveHeadPolicy,
  isModule,
  type VitestConfigFactory,
  resolveLayout,
} from './layout-views.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const sourcePath: (file: string) => string = checkoutModulePath;

export const defaults = path.join(fileURLToPath(new URL('../../', import.meta.url)), 'defaults');

export const customPolicy: Policy = {
  exclude: ['lib/legacy/**'],
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
};

export const customLayout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, [
  'lib/legacy/**',
]);

const temporaryRoots: string[] = [];

export function trackTemporaryRoot(root: string): void {
  temporaryRoots.push(root);
}

export function removeTemporaryRoots(): void {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function readDefault(name: string): unknown {
  return parseJson(readFileSync(path.join(defaults, name), 'utf8'));
}

export async function loadConfig<Module extends object, Result>(
  relativePath: string,
  policy: Policy | undefined,
  read: (module: Module) => Result,
): Promise<Result> {
  const restore = setPolicyEnvironment(policy);
  try {
    const url = pathToFileURL(
      sourcePath(path.join(fileURLToPath(new URL('../../', import.meta.url)), relativePath)),
    );
    url.search = `policy=${randomUUID()}`;
    const loaded: unknown = await import(url.href);
    if (!isModule<Module>(loaded)) {
      throw new TypeError(`${relativePath} does not load as a module`);
    }
    return read(loaded);
  } finally {
    restore();
  }
}

export function temporaryProject(files: Readonly<Record<string, string>>): string {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-'));
  trackTemporaryRoot(projectRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(projectRoot, name), text);
  }
  return projectRoot;
}

export async function resolveVitestConfig(
  relativePath: string,
  policy: Policy | undefined,
  projectFiles: Readonly<Record<string, string>> = {},
): Promise<VitestConfig> {
  const config = await loadConfig(
    relativePath,
    policy,
    (module: { readonly default: VitestConfigFactory }) => module.default,
  );
  const projectRoot = temporaryProject(projectFiles);
  const restorePolicy = setPolicyEnvironment(policy);
  const previousDirectory = process.cwd();
  process.chdir(projectRoot);
  try {
    return await config({ command: 'serve', mode: 'test' });
  } finally {
    process.chdir(previousDirectory);
    restorePolicy();
  }
}

function setPolicyEnvironment(policy: Policy | undefined): () => void {
  const previous = process.env['NITPICKER_POLICY'];
  if (policy === undefined) {
    delete process.env['NITPICKER_POLICY'];
  } else {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-config-'));
    trackTemporaryRoot(root);
    const policyFile = path.join(root, 'policy.json');
    const { frameworks } = policy;
    writeFileSync(policyFile, JSON.stringify({ ...resolveHeadPolicy(policy), frameworks }));
    process.env['NITPICKER_POLICY'] = policyFile;
  }
  return () => {
    if (previous === undefined) {
      delete process.env['NITPICKER_POLICY'];
    } else {
      process.env['NITPICKER_POLICY'] = previous;
    }
  };
}
