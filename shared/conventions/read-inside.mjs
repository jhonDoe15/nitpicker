import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export function resolveInside(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  return full.startsWith(base + path.sep) ? full : undefined;
}

export function isRegularFile(file) {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

export function staysInside(root, file) {
  const relative = path.relative(realpathSync(root), realpathSync(file));
  return !(relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative));
}

export function readInside(root, relative, encoding) {
  const full = resolveInside(root, relative);
  return full !== undefined && isRegularFile(full) ? readFileSync(full, encoding) : undefined;
}
