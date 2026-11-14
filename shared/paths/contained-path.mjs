import path from 'node:path';

export function containedPath(root, relative, { includeRoot = false, outside }) {
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep) && !(includeRoot && full === root)) {
    throw new Error(outside(relative));
  }
  return full;
}
