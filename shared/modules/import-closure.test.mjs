import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importClosure } from './import-closure.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-import-closure-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

describe('importClosure', () => {
  it('follows relative imports, re-exports and dynamic imports once each', () => {
    write({
      'entry.mjs':
        "import { a } from './a.mjs';\nimport './side.mjs';\nimport path from 'node:path';\n" +
        "const lazy = await import('./lazy/b.mjs');\n",
      'a.mjs': "export { b } from './lazy/b.mjs';\nimport {\n  c,\n} from '../outside/c.mjs';\n",
      'side.mjs': "import { a } from './a.mjs';\n",
      'lazy/b.mjs': 'export const b = 1;\n',
      '../outside/c.mjs': 'export const c = 1;\n',
    });

    expect(importClosure(path.join(root, 'entry.mjs'))).toEqual(
      ['entry.mjs', 'a.mjs', 'side.mjs', 'lazy/b.mjs', '../outside/c.mjs'].map((file) =>
        path.join(root, file),
      ),
    );
  });
});
