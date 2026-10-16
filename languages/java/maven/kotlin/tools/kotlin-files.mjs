import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const EMPTY_SARIF = '{"version":"2.1.0","runs":[]}';

export function kotlinFiles(roots) {
  return roots
    .filter((root) => existsSync(root))
    .flatMap((root) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.kt'))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

export function relativeTo(basedir, file) {
  return path.relative(basedir, file).replaceAll('\\', '/');
}
