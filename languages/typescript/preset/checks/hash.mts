import path from 'node:path';
import { createHash } from 'node:crypto';
import { importClosure, unchangingImportClosure } from '../../../../shared/import-closure.mts';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

type ClosureOf = (relativePaths: readonly string[], root: string) => Map<string, string>;
const importClosureOf: ClosureOf = importClosure;

function onceByKey<Value>(): (key: string, create: () => Value) => Value {
  const known = new Map<string, Value>();
  return (key, create) => {
    const found = known.get(key);
    if (found !== undefined) {
      return found;
    }
    const created = create();
    known.set(key, created);
    return created;
  };
}

const packageClosure = onceByKey<Map<string, string>>();
const packageFiles = unchangingImportClosure(packageRoot);
const packageFilesOf: ClosureOf = (relativePaths) => packageFiles(relativePaths);

function closureContents(
  relativePaths: readonly string[],
  root: string,
  closureOf: ClosureOf,
): Map<string, string> {
  if (root !== packageRoot) {
    return closureOf(relativePaths, root);
  }
  const read = closureOf === importClosureOf ? packageFilesOf : closureOf;
  return packageClosure(relativePaths.join('\0'), () => read(relativePaths, root));
}

export function hashFiles(
  relativePaths: readonly string[],
  configurationValues: readonly string[] = [],
  {
    root = packageRoot,
    closureOf = importClosureOf,
  }: { root?: string; closureOf?: ClosureOf } = {},
): string {
  const hash = createHash('sha256');
  const contents = closureContents(relativePaths, root, closureOf);
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
