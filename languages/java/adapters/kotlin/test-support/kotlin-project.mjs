import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Creates throwaway Kotlin project directories and removes every one it made. */
export function kotlinProjects() {
  const temporaryRoots = [];

  function remove() {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function project(files = {}) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-tools-')));
    temporaryRoots.push(root);
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) {
        throw new Error(`${relative} is outside the test project`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    return root;
  }

  return { project, remove };
}
