import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

type TempProjects = {
  tempRoot: () => string;
  projectWith: (files: Record<string, string>) => string;
};

export function useTempProjects(prefix: string): TempProjects {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot() {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  function projectWith(files: Record<string, string>) {
    const root = tempRoot();
    for (const [relative, text] of Object.entries(files)) {
      const full = path.resolve(root, relative);
      if (!full.startsWith(root + path.sep)) {
        throw new Error(`${relative} is outside ${root}`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  }

  return { tempRoot, projectWith };
}
