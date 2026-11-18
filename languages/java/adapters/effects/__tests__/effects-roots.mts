import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

export function effectsRoot(prefix: string, report: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'effects.json'), JSON.stringify(report));
  return root;
}
