import path from 'node:path';

export function inModule(modulePath, relativePath) {
  if (modulePath === undefined || modulePath === '') {
    return relativePath;
  }
  return relativePath === '.' ? modulePath : `${modulePath}/${relativePath}`;
}

function asDirectory(root) {
  const normalized = path.posix.normalize(root.replaceAll('\\', '/')).replace(/\/+$/u, '');
  return normalized === '' ? '.' : normalized;
}

function insideProject(directory) {
  return (
    directory !== '..' &&
    !directory.startsWith('../') &&
    !path.isAbsolute(directory) &&
    !/^[A-Za-z]:/u.test(directory)
  );
}

export function rootsScope(roots, moduleDir = '') {
  const scope = [
    ...new Set(roots.map((root) => asDirectory(root)).filter((root) => insideProject(root))),
  ];
  return scope.length === 0 ? [asDirectory(moduleDir)] : scope;
}
