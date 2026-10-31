import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
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

export function isRealPathInside(root, full) {
  const relative = path.relative(realpathSync.native(root), realpathSync.native(full));
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

export function realFileInside(root, relative) {
  const full = resolveInside(root, relative);
  if (full === undefined || !existsSync(full) || !statSync(full).isFile()) {
    return undefined;
  }
  return isRealPathInside(root, full) ? full : undefined;
}

export function readRealInside(root, relative, encoding) {
  const full = realFileInside(root, relative);
  return full === undefined ? undefined : readFileSync(full, encoding);
}
