import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importClosure } from '../import-closure.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-closure-'));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), contents);
  }
  return root;
}

describe('import closure', () => {
  it('follows static, dynamic and re-export imports across folders', () => {
    const root = project({
      'a/main.mjs':
        "import { b } from './b.mjs';\nexport * from '../c/c.mjs';\nawait import('./d.mjs');\n",
      'a/b.mjs': "import './e.mjs';\n",
      'a/d.mjs': 'export const d = 1;\n',
      'a/e.mjs': 'export const e = 1;\n',
      'c/c.mjs': "import { b } from '../a/b.mjs';\n",
      'unrelated.mjs': 'export const unused = 1;\n',
    });

    expect([...importClosure(['a/main.mjs'], root).keys()].sort()).toEqual([
      'a/b.mjs',
      'a/d.mjs',
      'a/e.mjs',
      'a/main.mjs',
      'c/c.mjs',
    ]);
  });

  it('ignores package imports, missing files and imports outside the root', () => {
    const root = project({
      'inner/main.mjs':
        "import path from 'node:path';\nimport x from 'vitest';\nimport y from '../missing.mjs';\nimport z from '../../../outside.mjs';\n",
    });

    expect([...importClosure(['inner/main.mjs'], root).keys()]).toEqual(['inner/main.mjs']);
  });

  it('keeps resource files without reading imports from them', () => {
    const root = project({
      'gradle/init.gradle': "import './nothing.mjs'\n",
      'main.mjs': 'export {};\n',
    });

    expect(importClosure(['gradle/init.gradle', 'main.mjs'], root)).toEqual(
      new Map([
        ['gradle/init.gradle', "import './nothing.mjs'\n"],
        ['main.mjs', 'export {};\n'],
      ]),
    );
  });

  it('keeps a file it is told to stop at without following its imports', () => {
    const root = project({
      'main.mjs': "import './gate.mjs';\nimport './side.mjs';\n",
      'gate.mjs': "import './behind.mjs';\n",
      'side.mjs': 'export {};\n',
      'behind.mjs': 'export {};\n',
    });

    expect(
      [...importClosure(['main.mjs'], root, { stopAt: new Set(['gate.mjs']) }).keys()].sort(),
    ).toEqual(['gate.mjs', 'main.mjs', 'side.mjs']);
  });
});
