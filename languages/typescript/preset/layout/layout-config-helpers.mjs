import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { resolveHeadPolicy } from '../head-policy.mjs';
import { resolveLayout } from '../layout.mjs';

export const defaults = path.join(new URL('../', import.meta.url).pathname, 'defaults');

export const customPolicy = {
  exclude: ['lib/legacy/**'],
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
};

export const customLayout = resolveLayout({ sourceRoots: ['lib'], testRoots: ['spec'] }, [
  'lib/legacy/**',
]);

const temporaryRoots = [];

export function trackTemporaryRoot(root) {
  temporaryRoots.push(root);
}

export function removeTemporaryRoots() {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function readDefault(name) {
  return JSON.parse(readFileSync(path.join(defaults, name), 'utf8'));
}

export const FILE_SELECTION = (module) =>
  module.default.map(({ files, ignores }) => ({ files, ignores }));

// Config modules read the head policy once, at import time. Each distinct policy therefore gets
// its own module instance (a unique query string), while shared dependencies such as
// typescript-eslint load once per test file instead of once per process.
let policyImportCount = 0;

export async function loadConfig(relativePath, policy, read = (module) => module.default) {
  const restore = setPolicyEnvironment(policy);
  try {
    policyImportCount += 1;
    const url = pathToFileURL(path.join(new URL('../', import.meta.url).pathname, relativePath));
    url.search = `policy=${String(policyImportCount)}`;
    return read(await import(url.href));
  } finally {
    restore();
  }
}

export function temporaryProject(files) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-'));
  trackTemporaryRoot(projectRoot);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(projectRoot, name), text);
  }
  return projectRoot;
}

// The copied Vitest configs are functions that look for the project's own config in the
// directory Vitest runs in, so each call runs in a fresh project directory.
export async function resolveVitestConfig(relativePath, policy, projectFiles = {}) {
  const config = await loadConfig(relativePath, policy);
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

function setPolicyEnvironment(policy) {
  const previous = process.env.NITPICKER_POLICY;
  if (policy === undefined) {
    delete process.env.NITPICKER_POLICY;
  } else {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-layout-config-'));
    trackTemporaryRoot(root);
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(resolveHeadPolicy(policy)));
    process.env.NITPICKER_POLICY = policyFile;
  }
  return () => {
    if (previous === undefined) {
      delete process.env.NITPICKER_POLICY;
    } else {
      process.env.NITPICKER_POLICY = previous;
    }
  };
}
