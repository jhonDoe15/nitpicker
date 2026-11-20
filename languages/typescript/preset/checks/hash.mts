import path from 'node:path';
import { createHash } from 'node:crypto';
import { importClosure } from '../../../../shared/import-closure.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

const closureOf: (
  relativePaths: readonly string[],
  root: string,
  options: { stopAt?: Set<string> } | undefined,
) => Map<string, string> = importClosure;

export function hashFiles(
  relativePaths: readonly string[],
  configurationValues: readonly string[] = [],
  { root = packageRoot }: { root?: string } = {},
): string {
  const hash = createHash('sha256');
  const contents = closureOf(relativePaths, root, undefined);
  for (const relativePath of [...contents.keys()].sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(contents.get(relativePath) ?? '');
    hash.update('\0');
  }
  for (const configurationValue of [...new Set(configurationValues)].sort()) {
    hash.update(configurationValue);
    hash.update('\0');
  }
  return hash.digest('hex');
}
