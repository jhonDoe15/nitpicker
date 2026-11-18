import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

export function tempProjects(
  prefix: string,
): (files: Readonly<Record<string, string | object>>) => string {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return (files) => {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    for (const [file, text] of Object.entries(files)) {
      const target = path.resolve(root, file);
      if (!target.startsWith(root + path.sep)) {
        throw new Error(`Project file escapes its root: ${file}`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, typeof text === 'string' ? text : JSON.stringify(text));
    }
    return root;
  };
}
