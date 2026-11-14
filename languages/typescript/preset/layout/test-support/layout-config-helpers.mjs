import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { resolveHeadPolicy } from '../../head-policy.mjs';
import { resolveLayout } from '../../layout.mjs';

export const defaults = path.join(fileURLToPath(new URL('../../', import.meta.url)), 'defaults');

export const customPolicy = {
  exclude: ['lib/legacy/**'],
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
  react: { enabled: false },
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

export function selectFilesAndIgnores(module) {
  return module.default.map(({ files, ignores }) => ({ files, ignores }));
}

export async function loadConfig(relativePath, policy, read = (module) => module.default) {
  const restore = setPolicyEnvironment(policy);
  try {
    const url = pathToFileURL(
      path.join(fileURLToPath(new URL('../../', import.meta.url)), relativePath),
    );
    url.search = `policy=${randomUUID()}`;
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
    const { frameworks } = policy;
    writeFileSync(policyFile, JSON.stringify({ ...resolveHeadPolicy(policy), frameworks }));
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
