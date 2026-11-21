import path from 'node:path';

export function containedPath(
  root: string,
  relative: string,
  {
    includeRoot,
    outside,
  }: {
    readonly includeRoot?: true;
    readonly outside: (relative: string) => string;
  },
): string {
  const full = path.resolve(root, relative);
  if (!(full.startsWith(root + path.sep) || (includeRoot && full === root))) {
    throw new Error(outside(relative));
  }
  return full;
}

export function isInsideDirectory(parent: string, directory: string): boolean {
  const relative = path.relative(parent, directory);
  return relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
}

export function isOutsideDirectory(parent: string, directory: string): boolean {
  const relative = path.relative(parent, directory);
  return relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative));
}
