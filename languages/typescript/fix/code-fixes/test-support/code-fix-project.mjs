import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { containedPath } from '../../../../../core/fix/common/contained-path.mjs';
import { afterEach } from 'vitest';
import { planCodeFixes } from '../plan-code-fixes.mjs';

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    target: 'es2022',
    module: 'nodenext',
    moduleResolution: 'nodenext',
    noImplicitOverride: true,
    noEmit: true,
  },
  include: ['src'],
};

export function useCodeFixProjects() {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return function fixes(files, { target = 'src/a.ts', ...options } = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-code-fix-'));
    roots.push(root);
    writeFileSync(containedPath(root, 'tsconfig.json'), JSON.stringify(TSCONFIG));
    writeFileSync(containedPath(root, 'package.json'), '{"type":"module"}');
    for (const [name, text] of Object.entries(files)) {
      const file = containedPath(root, name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return planCodeFixes({
      projectRoot: root,
      javascript: false,
      files: [{ name: target, text: files[target] }],
      ...options,
    });
  };
}
