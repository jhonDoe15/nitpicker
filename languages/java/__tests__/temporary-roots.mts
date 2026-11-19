import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

export function registerTemporaryRoots(): string[] {
  const created: string[] = [];
  afterEach(() => {
    for (const root of created.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return created;
}

export function temporaryRootMaker(prefix: string): () => string {
  const created = registerTemporaryRoots();
  return () => {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    created.push(root);
    return root;
  };
}

export function writeFiles(root: string, files: Readonly<Record<string, string>>): void {
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

export function temporaryProjectMaker(
  prefix: string,
): (files: Readonly<Record<string, string>>) => string {
  const makeRoot = temporaryRootMaker(prefix);
  return (files) => {
    const root = makeRoot();
    writeFiles(root, files);
    return root;
  };
}
