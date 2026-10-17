import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const roots = [];

export function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-env-')));
  roots.push(root);
  return root;
}

export function write(root, relative, text = '') {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), text);
}

export function writeAll(root, files) {
  for (const [name, text] of Object.entries(files)) {
    write(root, name, text);
  }
}

export function removeTemporaryRoots() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function pyproject(dependency, extra = '') {
  return `[project]\nname = "demo"\nversion = "1"\ndependencies = ["${dependency}"]\n${extra}`;
}
