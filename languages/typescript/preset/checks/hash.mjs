import path from 'node:path';
import { createHash } from 'node:crypto';
import { importClosure } from '../../../../shared/import-closure.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

const packageClosures = new Map();

function closureHash(relativePaths, root, closureOf) {
  const hash = createHash('sha256');
  const contents = closureOf(relativePaths, root);
  for (const relativePath of [...contents.keys()].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents.get(relativePath));
    hash.update('\0');
  }
  return hash;
}

function packageClosureHash(relativePaths, closureOf) {
  const key = relativePaths.join('\0');
  const known = packageClosures.get(key) ?? closureHash(relativePaths, packageRoot, closureOf);
  packageClosures.set(key, known);
  return known.copy();
}

export function hashFiles(
  relativePaths,
  configurationValues = [],
  { root = packageRoot, closureOf = importClosure } = {},
) {
  const hash =
    root === packageRoot
      ? packageClosureHash(relativePaths, closureOf)
      : closureHash(relativePaths, root, closureOf);
  for (const configurationValue of [...new Set(configurationValues)].sort()) {
    hash.update(configurationValue);
    hash.update('\0');
  }
  return hash.digest('hex');
}
