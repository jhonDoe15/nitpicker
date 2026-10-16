import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temporary = [];

export function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}

export function withoutGradle(root) {
  for (const name of readdirSync(root, { recursive: true })) {
    if (/(?:^|[/\\])(?:build|settings)\.gradle$/u.test(name)) {
      rmSync(path.join(root, name));
    }
  }
  return root;
}

export function removeCopies() {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
