import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

export function scratchTrees(prefix: string): (files: Readonly<Record<string, string>>) => string {
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  return (files) => {
    const root = mkdtempSync(path.join(scratch, 'tree-'));
    for (const [name, text] of Object.entries(files)) {
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) {
        throw new Error(`${name} is outside the scratch tree`);
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return root;
  };
}
