import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-decided-condition.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-decided-helpers-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, types: [], lib: ['ES2022'] },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, errors) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

function error(messageId, condition, reason) {
  return { messageId, data: { condition, reason } };
}

tester.run('no-decided-condition through helpers', rule, {
  valid: [
    'function ok(n: number) { return n > 0; } export function f(n: number, m: number) { if (!ok(n)) return 0; return m <= 0 ? 1 : 2; }',
    'let limit = 3; function under(n: number) { return n < limit; } export function f(n: number) { if (!under(n)) return 0; limit = 1; return under(n) ? 1 : 2; }',
    'function deep(n: number): boolean { return n > 0 && deep(n - 1); } export function f(n: number) { if (!deep(n)) return 0; return n <= 0 ? 1 : 2; }',
    'declare function log(n: number): boolean; function ok(n: number) { return log(n) && n > 0; } export function f(n: number) { if (!ok(n)) return 0; return n <= 0 ? 1 : 2; }',
    'const o = { ok(n: number) { return n > 0; } }; export function f(n: number) { if (!o.ok(n)) return 0; return n <= 0 ? 1 : 2; }',
    'function before(a: string, b: string) { return a < b; } export function f(x: string, y: string, z: string) { if (!before(x, y)) return 0; return before(x, z) ? 1 : 2; }',
    'export function f(n: number) { function ok(m: number) { return m > 0; } if (!ok(n)) return 0; return n <= 0 ? 1 : 2; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'function ok(n: number) { return n > 0; } export function f(n: number) { if (!ok(n)) return 0; return n <= 0 ? 1 : 2; }',
      [
        error(
          'alwaysFalse',
          'n <= 0',
          'line 1 returns when `!ok(n)` is true, and `ok` tests `n > 0`',
        ),
      ],
    ),
    typed(
      'const ok = (n: number) => n > 0; export function f(n: number) { if (ok(n)) return 1; return ok(n) ? 2 : 3; }',
      [
        error(
          'alwaysFalse',
          'ok(n)',
          'line 1 returns when `ok(n)` is true, and `ok` tests `n > 0`',
        ),
      ],
    ),
    typed(
      'function positive(n: number) { return n > 0; } function small(n: number) { return positive(n) && n < 10; } export function f(n: number) { if (!small(n)) return 0; return n < 0 ? 1 : 2; }',
      [
        error(
          'alwaysFalse',
          'n < 0',
          'line 1 returns when `!small(n)` is true, and `small` tests `positive(n) && n < 10`, and `positive` tests `n > 0`',
        ),
      ],
    ),
  ],
});
