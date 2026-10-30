import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { hashFiles } from './hash.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-policy-hash-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
  return root;
}

it('invalidates a policy hash when an imported helper changes', () => {
  const root = fixture({
    'policy.mjs': "export { value } from './helper.mjs';",
    'helper.mjs': 'export const value = 1;',
  });
  const before = hashFiles(['policy.mjs'], [], { root });
  writeFileSync(path.join(root, 'helper.mjs'), 'export const value = 2;');
  expect(hashFiles(['policy.mjs'], [], { root })).not.toBe(before);
});

it('ignores unrelated files and includes explicitly listed non-module policies', () => {
  const root = fixture({
    'policy.mjs': 'export const value = 1;',
    'settings.json': '{}',
    'unrelated.mjs': 'export const extra = 1;',
  });
  const before = hashFiles(['policy.mjs', 'settings.json'], [], { root });
  writeFileSync(path.join(root, 'unrelated.mjs'), 'export const extra = 2;');
  expect(hashFiles(['policy.mjs', 'settings.json'], [], { root })).toBe(before);
  writeFileSync(path.join(root, 'settings.json'), '{"enabled":true}');
  expect(hashFiles(['policy.mjs', 'settings.json'], [], { root })).not.toBe(before);
});

it('hashes import cycles once regardless of input ordering or repeated roots', () => {
  const root = fixture({ 'a.mjs': "import './b.mjs';", 'b.mjs': "import './a.mjs';" });
  expect(hashFiles(['a.mjs', 'b.mjs', 'a.mjs'], ['setting'], { root })).toBe(
    hashFiles(['b.mjs', 'a.mjs'], ['setting'], { root }),
  );
});

it('follows static, side-effect and dynamic relative imports without loading TypeScript', () => {
  const root = fixture({
    'policy.mjs': [
      "import { a } from './a.mjs';",
      "import './b.mjs';",
      'export { c } from "./c.mjs";',
      "const d = await import('./d.mjs');",
      "import path from 'node:path';",
    ].join('\n'),
    'a.mjs': 'export const a = 1;',
    'b.mjs': 'globalThis.b = 1;',
    'c.mjs': 'export const c = 1;',
    'd.mjs': 'export const d = 1;',
  });
  const names = ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs'];
  const changes = names.map((name) => {
    const before = hashFiles(['policy.mjs'], [], { root });
    writeFileSync(path.join(root, name), 'export const changed = true;');
    return hashFiles(['policy.mjs'], [], { root }) !== before;
  });
  expect(changes).toEqual(names.map(() => true));
});
