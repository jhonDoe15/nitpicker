import { insideProject } from '../../../../../libraries/project-files.mjs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function temporaryRoot(roots) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-env-')));
  roots.push(root);
  return root;
}

export function write(root, relative, text = '') {
  mkdirSync(path.dirname(insideProject(root, relative)), { recursive: true });
  writeFileSync(insideProject(root, relative), text);
}

export function writeAll(root, files) {
  for (const [name, text] of Object.entries(files)) {
    write(root, name, text);
  }
}

export function removeTemporaryRoots(roots) {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function pyproject(dependency, extra = '') {
  return `[project]\nname = "demo"\nversion = "1"\ndependencies = ["${dependency}"]\n${extra}`;
}
