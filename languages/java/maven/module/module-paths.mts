import path from 'node:path';

export function relativeTo(basedir: string, file: string): string {
  return path.relative(basedir, file).replaceAll('\\', '/');
}

export function relativeRoots(
  module: { readonly basedir: string },
  roots: readonly string[],
): string[] {
  return roots.map((root) => relativeTo(module.basedir, root));
}
