import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { containedPath } from '../../core/fix/common/contained-path.mjs';

export type Files = Readonly<Record<string, string>>;

export function temporaryRepositories(prefix: string): (files: Files) => string {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return function repository(files: Files): string {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    for (const [file, text] of Object.entries(files)) {
      const full = containedPath(root, file);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  };
}
