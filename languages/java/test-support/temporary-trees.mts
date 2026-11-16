import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type TemporaryTrees = {
  readonly tree: (files?: Readonly<Record<string, string | Uint8Array>>) => string;
  readonly cleanup: () => void;
};

export function temporaryTrees(prefix: string): TemporaryTrees {
  const roots: string[] = [];

  function tree(files: Readonly<Record<string, string | Uint8Array>> = {}): string {
    const root = mkdtempSync(path.join(tmpdir(), prefix));
    roots.push(root);
    for (const [name, content] of Object.entries(files)) {
      const full = path.resolve(root, name);
      if (!full.startsWith(root + path.sep)) {
        throw new Error(`${name} is outside ${root}`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    return root;
  }

  function cleanup(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { tree, cleanup };
}
