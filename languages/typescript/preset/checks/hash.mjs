import path from 'node:path';
import { createHash } from 'node:crypto';
import { importClosure } from '../../../../shared/import-closure.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

export function hashFiles(relativePaths, configurationValues = [], { root = packageRoot } = {}) {
  const hash = createHash('sha256');
  const contents = importClosure(relativePaths, root);
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
