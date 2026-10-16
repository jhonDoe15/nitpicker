export function inModule(modulePath, relativePath) {
  if (modulePath === undefined || modulePath === '') {
    return relativePath;
  }
  return relativePath === '.' ? modulePath : `${modulePath}/${relativePath}`;
}
