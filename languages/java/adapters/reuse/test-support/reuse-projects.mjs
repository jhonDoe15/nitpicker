import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Temporary JVM projects built from `{ path: text }` maps, removed by `cleanup`. */
export function createReuseProjects() {
  const roots = [];
  function project(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'jvm-reuse-'));
    roots.push(root);
    for (const [name, text] of Object.entries(files)) {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) {
        throw new Error(`${name} is outside the project`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    return root;
  }
  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
  return { project, cleanup };
}
