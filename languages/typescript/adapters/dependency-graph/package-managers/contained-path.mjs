import path from 'node:path';

export function containedPath(base, relative) {
  const root = path.resolve(base);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Path leaves its base directory: ${relative}`);
  }
  return full;
}
