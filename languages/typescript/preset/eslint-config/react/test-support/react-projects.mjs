import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export function temporaryProjects() {
  const roots = [];
  return {
    projectWith: (manifest) => {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-scope-'));
      roots.push(root);
      if (manifest !== undefined) {
        writeFileSync(path.join(root, 'package.json'), manifest);
      }
      return root;
    },
    removeProjects: () => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

export function installReact(projectRoot, version) {
  mkdirSync(path.join(projectRoot, 'node_modules/react'), { recursive: true });
  writeFileSync(
    path.join(projectRoot, 'node_modules/react/package.json'),
    JSON.stringify({ name: 'react', version }),
  );
}

export function manifestWith(fields) {
  return JSON.stringify({ name: 'app', ...fields });
}
