import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './simpler-boolean-logic.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-simpler-logic-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: { strict: true, module: 'esnext', noEmit: true, types: [], lib: ['ES2022'] },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const untyped = typescriptRuleTester();
const typedTester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function reported(code, ...forms) {
  return {
    code,
    errors: forms.map((form) =>
      form.startsWith('swapped ')
        ? { messageId: 'swapped', data: { form: form.slice('swapped '.length) } }
        : { messageId: 'simpler', data: { form } },
    ),
  };
}

function typed(code, ...forms) {
  const filename = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(filename, code);
  return { filename, ...(forms.length === 0 ? { code } : reported(code, ...forms)) };
}

untyped.run('simpler-boolean-logic', rule, {
  valid: [
    'function f(a, b) { return a < b; }',
    'function f(ready) { if (ready) { return true; } return false; }',
    'function f(ready) { return ready ? true : false; }',
    'function f(a, b) { if (a) { if (b) { run(); } else { stop(); } } }',
    'function f(a, b) { if (a) { if (b) { run(); } } else { stop(); } }',
    'function f(a, b) { if (a) { prepare(); if (b) { run(); } } }',
    'function f(a, b) { if (!a) { run(); } else if (b) { stop(); } }',
    'function f(a) { if (!a) { run(); } }',
    'function f(a, b, c) { return !a ? b : c ? 1 : 2; }',
    'function f(a, b) { return !(a < b); }',
    'function f(a, b, c) { return !a && !b && c; }',
    'function f(a, b) { return x && !a && !b; }',
    'function f(a, b) { return !a ?? b; }',
    'function f(a) { if (!!a) { run(); } }',
    'function f(a) { return !!a; }',
    'function f(a, b) { return a ? b : false; }',
    'function f(a, b) { return a ? false : b; }',
    'function f(a) { return a === undefined ? [a] : true; }',
    'function f(a, b) { while (a !== b) { step(); } }',
  ],
  invalid: [
    reported('function f(a, b) { if (a < b) { return true; } return false; }', 'return a < b;'),
    reported(
      'function f(a, b) { if (a < b) { return false; } else { return true; } }',
      'return !(a < b);',
    ),
    reported('function f(a) { if (a) { return false; } return true; }', 'return !a;'),
    reported('function f(a, b) { if (a) { if (b) { run(); } } }', 'if (a && b) { … }'),
    reported(
      'function f(a, b, c) { if (a) { if (b || c) { if (c) { run(); } } } }',
      'if (a && (b || c) && c) { … }',
    ),
    reported(
      'function f(a) { if (!a) { run(); } else { stop(); } }',
      'swapped if (a) { … } else { … }',
    ),
    reported(
      'function f(a, b) { if (!a && !b) { run(); } else { stop(); } }',
      'swapped if (a || b) { … } else { … }',
    ),
    reported('function f(a, b) { return !(a === b); }', 'a !== b'),
    reported('function f(a, b) { const same = !(a == b); return same; }', 'a != b'),
    reported('function f(a, b) { return !a && !b; }', '!(a || b)'),
    reported('function f(a, b, c) { return !a || !b || !c; }', '!(a && b && c)'),
    reported('function f(a, b) { return (a < b) ? true : false; }', 'a < b'),
    reported('function f(a, b) { return (a < b) ? false : true; }', '!(a < b)'),
    reported('function f(a, b, c) { return a ? false : b < c; }', '!a && b < c'),
    reported('function f(a, b, c) { return a ? b < c : true; }', '!a || b < c'),
    reported('function f(a, b) { return !(a.find((x) => x) == b); }', 'a.find((x) => x) != b'),
    reported('function f(a, b, c) { return !a ? b : c; }', 'swapped a ? c : b'),
    reported('function f(a, b) { return !!(a < b); }', 'a < b'),
    reported('function f() { return !true; }', 'false'),
    reported('function f(a, b) { while (!(a == b)) { step(); } }', 'a != b'),
    reported('const x = (a, b) => !a && !b;', '!(a || b)'),
    reported(
      'function f(a, b, c) { if (c) { if (!(a == b)) { run(); } } else { stop(); } }',
      'a != b',
    ),
    reported(
      'for (const a of list) if (!a) { run(); } else { stop(); }',
      'swapped if (a) { … } else { … }',
    ),
    reported('switch (k) { case 1: if (a) { if (b) { run(); } } }', 'if (a && b) { … }'),
  ],
});

typedTester.run('simpler-boolean-logic with types', rule, {
  valid: [
    typed('export function f(name: string) { if (name) { return true; } return false; }'),
    typed('export function f(count: number) { return count ? true : false; }'),
    typed('export function f(flag: boolean | undefined) { return !!flag; }'),
    typed('export function f(ready: boolean, b: string) { return ready ? b : false; }'),
  ],
  invalid: [
    typed(
      'export function f(ready: boolean) { if (ready) { return true; } return false; }',
      'return ready;',
    ),
    typed('export function f(ready: boolean) { return ready ? true : false; }', 'ready'),
    typed('export function f(ready: boolean) { return !!ready; }', 'ready'),
    typed(
      'export function f(ready: boolean, b: boolean) { return ready ? b : false; }',
      'ready && b',
    ),
    typed(
      'export function f(items: string[]) { return items.includes("a") ? true : false; }',
      'items.includes("a")',
    ),
  ],
});
