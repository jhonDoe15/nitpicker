import path from 'node:path';

export function containedPath(root, name) {
  const base = path.resolve(root);
  const full = path.resolve(base, name);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${name} is outside ${base}`);
  }
  return full;
}
