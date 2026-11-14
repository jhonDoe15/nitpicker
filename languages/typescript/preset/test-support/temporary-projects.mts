import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach } from 'vitest';
import { containedPath as untypedContainedPath } from '../../../../core/fix/common/contained-path.mjs';

const containedPath: (root: string, name: string) => string = untypedContainedPath;

type TemporaryProjects = {
  emptyProject: () => string;
  projectWith: (files: Record<string, string>) => string;
};

export function writeProjectFiles(root: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    const target = containedPath(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}

type Options = { resolveSymlinks?: true; keepForFile?: true };

export function useTemporaryProjects(prefix: string, options: Options = {}): TemporaryProjects {
  const roots: string[] = [];

  const cleanUp = options.keepForFile ? afterAll : afterEach;

  cleanUp(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function emptyProject() {
    const created = mkdtempSync(path.join(tmpdir(), prefix));
    const root = options.resolveSymlinks ? realpathSync(created) : created;
    roots.push(root);
    return root;
  }

  function projectWith(files: Record<string, string>) {
    const root = emptyProject();
    writeProjectFiles(root, files);
    return root;
  }

  return { emptyProject, projectWith };
}
