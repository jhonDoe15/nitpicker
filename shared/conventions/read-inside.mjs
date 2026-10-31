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

export function firstProjectFile(root, names) {
  return names.find((name) => {
    const file = resolveInside(root, name);
    return file !== undefined && isRegularFile(file);
  });
}

export function readInside(root, relative, encoding) {
  const full = resolveInside(root, relative);
  return full !== undefined && isRegularFile(full) ? readFileSync(full, encoding) : undefined;
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
  if (full === undefined || !isRegularFile(full)) {
    return undefined;
  }
  return isRealPathInside(root, full) ? full : undefined;
}

export function readRealInside(root, relative, encoding) {
  const full = realFileInside(root, relative);
  return full === undefined ? undefined : readFileSync(full, encoding);
}
