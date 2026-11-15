import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function hashConfigurationFiles(
  packageRoot: string,
  payload: unknown,
  relativePaths: readonly string[],
): string {
  const hash = createHash('sha256').update(JSON.stringify(payload));
  for (const relativePath of relativePaths) {
    hash.update(`\0${relativePath}\0`);
    const full = path.resolve(packageRoot, relativePath);
    if (!full.startsWith(packageRoot + path.sep)) {
      throw new Error(`Configuration file ${relativePath} is outside the package`);
    }
    hash.update(readFileSync(full));
  }
  return hash.digest('hex');
}
