import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

type TemporaryProjects = {
  emptyProject: () => string;
  projectWith: (files: Record<string, string>) => string;
};

export function writeProjectFiles(root: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

type Options = { resolveSymlinks?: true };

export function useTemporaryProjects(prefix: string, options: Options = {}): TemporaryProjects {
  const roots: string[] = [];

  afterEach(() => {
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
