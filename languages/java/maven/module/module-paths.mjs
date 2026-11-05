import path from 'node:path';

export function relativeTo(basedir, file) {
  return path.relative(basedir, file).replaceAll('\\', '/');
}

export function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}
