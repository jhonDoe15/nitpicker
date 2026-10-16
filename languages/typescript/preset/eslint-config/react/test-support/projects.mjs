import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function manifestWith(fields) {
  return JSON.stringify({ name: 'app', ...fields });
}

export function createProjects() {
  const roots = [];

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function projectWith(manifest) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-scope-'));
    roots.push(root);
    if (manifest !== undefined) {
      writeFileSync(path.join(root, 'package.json'), manifest);
    }
    return root;
  }

  return { cleanup, projectWith };
}
