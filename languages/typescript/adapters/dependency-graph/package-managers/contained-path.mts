import path from 'node:path';

export function containedPath(base: string, relative: string): string {
  const root = path.resolve(base);
  const full = path.resolve(root, relative);
  const fromRoot = path.relative(root, full);
  if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new Error(`Path leaves its base directory: ${relative}`);
  }
  return full;
}
