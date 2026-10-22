import path from 'node:path';

export function containedPath(root, name) {
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside ${root}`);
  }
  return full;
}
