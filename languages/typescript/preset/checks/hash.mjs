import path from 'node:path';
import { createHash } from 'node:crypto';
import { importClosure } from '../../../../shared/import-closure.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

function onceByKey() {
  const known = new Map();
  return (key, create) => {
    if (!known.has(key)) {
      known.set(key, create());
    }
    return known.get(key);
  };
}

const packageClosure = onceByKey();

function closureContents(relativePaths, root, closureOf) {
  return root === packageRoot
    ? packageClosure(relativePaths.join('\0'), () => closureOf(relativePaths, root))
    : closureOf(relativePaths, root);
}

export function hashFiles(
  relativePaths,
  configurationValues = [],
  { root = packageRoot, closureOf = importClosure } = {},
) {
  const hash = createHash('sha256');
  const contents = closureContents(relativePaths, root, closureOf);
  for (const relativePath of [...contents.keys()].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents.get(relativePath));
    hash.update('\0');
  }
  for (const configurationValue of [...new Set(configurationValues)].sort()) {
    hash.update(configurationValue);
    hash.update('\0');
  }
  return hash.digest('hex');
}
