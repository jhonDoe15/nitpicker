import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function resolveInside(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  return full.startsWith(base + path.sep) ? full : undefined;
}

export function readInside(root, relative, encoding) {
  const full = resolveInside(root, relative);
  return full !== undefined && existsSync(full) ? readFileSync(full, encoding) : undefined;
}
