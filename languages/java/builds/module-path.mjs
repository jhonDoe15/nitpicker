import path from 'node:path';

export function inModule(modulePath, relativePath) {
  if (modulePath === undefined || modulePath === '') {
    return relativePath;
  }
  return relativePath === '.' ? modulePath : `${modulePath}/${relativePath}`;
}

function asDirectory(root) {
  const normalized = path.posix.normalize(root).replace(/\/+$/u, '');
  return normalized === '' ? '.' : normalized;
}

function inProject(modulePath, root) {
  const slashed = root.replaceAll('\\', '/');
  if (slashed.startsWith('/') || /^[A-Za-z]:/u.test(slashed)) {
    return undefined;
  }
  const directory = asDirectory(path.posix.join(modulePath, slashed));
  return directory === '..' || directory.startsWith('../') ? undefined : directory;
}

export function rootsScope(roots, { moduleDir = '', modulePath = '' } = {}) {
  const directories = (roots.length === 0 ? [moduleDir] : roots).map((root) =>
    inProject(modulePath, root),
  );
  return [...new Set(directories.filter((directory) => directory !== undefined))];
}

export function liesInProject(projectPath, { modulePath = '' } = {}) {
  return inProject(modulePath, projectPath) !== undefined;
}
