import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appendAll } from '../../shared/lists/items.mjs';

/** Compares strings by code point, so a generated file sorts the same on every machine. */
export function byCodePoint(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function isWanted(item, extension) {
  return item.isFile() && item.name.endsWith(extension) && !item.name.endsWith(`.test${extension}`);
}

/**
 * The files under `root` that end in `extension`, test files and the `skipped` folders left out,
 * as paths relative to `root` with forward slashes, in code-point order.
 */
export function emittedFrom(sources) {
  return (file) => file.endsWith('.mjs') && sources.has(`${file.slice(0, -'.mjs'.length)}.mts`);
}

export function registryFiles(root, extension, skipped = new Set()) {
  const files = [];
  const pending = [root];
  for (const directory of pending) {
    const items = readdirSync(directory, { withFileTypes: true });
    const folders = items.filter((item) => item.isDirectory() && !skipped.has(item.name));
    appendAll(
      pending,
      folders.map((item) => path.join(directory, item.name)),
    );
    appendAll(
      files,
      items
        .filter((item) => isWanted(item, extension))
        .map((item) => path.join(directory, item.name)),
    );
  }
  return files
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .toSorted(byCodePoint);
}

/** The text of `file`, a path that `registryFiles` listed under `root`. */
export function readRegistryFile(root, file) {
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${file} is outside ${root}`);
  }
  return readFileSync(full, 'utf8');
}
