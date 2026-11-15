import { insideProject } from '../../../../../libraries/project-files.mjs';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type RootTracker = { track(root: string): string; drain(): string[] };

export function createRootTracker(): RootTracker {
  const roots: string[] = [];
  return {
    track(root: string): string {
      roots.push(root);
      return root;
    },
    drain(): string[] {
      return roots.splice(0);
    },
  };
}

export function temporaryRoot(roots: RootTracker): string {
  return roots.track(realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-base-env-'))));
}

export function write(root: string, relative: string, text = ''): void {
  mkdirSync(path.dirname(insideProject(root, relative)), { recursive: true });
  writeFileSync(insideProject(root, relative), text);
}

export function writeAll(root: string, files: Readonly<Record<string, string>>): void {
  for (const [name, text] of Object.entries(files)) {
    write(root, name, text);
  }
}

export function removeTemporaryRoots(roots: RootTracker): void {
  for (const root of roots.drain()) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function pyproject(dependency: string, extra = ''): string {
  return `[project]\nname = "demo"\nversion = "1"\ndependencies = ["${dependency}"]\n${extra}`;
}
