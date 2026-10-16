import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads `relative` under `root`, or returns undefined when it is missing or escapes `root`. */
export function readInside(root, relative, encoding) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, encoding) : undefined;
}
