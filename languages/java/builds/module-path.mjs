export function inModule(modulePath, relativePath) {
  if (modulePath === undefined || modulePath === '') {
    return relativePath;
  }
  return relativePath === '.' ? modulePath : `${modulePath}/${relativePath}`;
}

export function rootsScope(roots) {
  const scope = [...new Set(roots.map((root) => (root === '' ? '.' : root)))];
  return scope.length === 0 ? ['.'] : scope;
}
