import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export function resolveInside(root: string, relative: string): string | undefined {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  return full.startsWith(base + path.sep) ? full : undefined;
}

function isRegularFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

export function firstProjectFile(root: string, names: readonly string[]): string | undefined {
  return names.find((name) => {
    const file = resolveInside(root, name);
    return file !== undefined && isRegularFile(file);
  });
}

export function readInside(
  root: string,
  relative: string,
  encoding: BufferEncoding,
): string | undefined;
export function readInside(root: string, relative: string): Buffer | undefined;
export function readInside(
  root: string,
  relative: string,
  encoding?: BufferEncoding,
): Buffer | string | undefined {
  const full = resolveInside(root, relative);
  return full !== undefined && isRegularFile(full) ? readFileSync(full, encoding) : undefined;
}

export function isRealPathInside(root: string, full: string): boolean {
  const relative = path.relative(realpathSync.native(root), realpathSync.native(full));
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

export function realFileInside(root: string, relative: string): string | undefined {
  const full = resolveInside(root, relative);
  if (full === undefined || !isRegularFile(full)) {
    return undefined;
  }
  return isRealPathInside(root, full) ? full : undefined;
}

export function readRealInside(
  root: string,
  relative: string,
  encoding: BufferEncoding,
): string | undefined;
export function readRealInside(root: string, relative: string): Buffer | undefined;
export function readRealInside(
  root: string,
  relative: string,
  encoding?: BufferEncoding,
): Buffer | string | undefined {
  const full = realFileInside(root, relative);
  return full === undefined ? undefined : readFileSync(full, encoding);
}
