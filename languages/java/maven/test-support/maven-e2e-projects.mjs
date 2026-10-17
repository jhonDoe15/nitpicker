import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GRADLE_BUILD_FILE = /(?:^|[/\\])(?:build|settings)\.gradle$/u;

export function temporaryCopies() {
  const roots = [];
  return {
    copyOf: (...sources) => {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
      roots.push(root);
      for (const source of sources) {
        cpSync(source, root, { recursive: true });
      }
      return root;
    },
    removeCopies: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

export function withoutGradle(root) {
  const base = path.resolve(root);
  for (const name of readdirSync(base, { recursive: true })) {
    const full = path.resolve(base, name);
    if (!full.startsWith(base + path.sep)) {
      throw new Error(`${name} is outside ${base}`);
    }
    if (GRADLE_BUILD_FILE.test(name)) {
      rmSync(full);
    }
  }
  return root;
}
