import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './shorter-boolean-logic.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-shorter-logic-')));
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

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, found) {
  const filename = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(filename, code);
  if (found === undefined) {
    return { filename, code };
  }
  const [condition, form, reason] = found;
  return { filename, code, errors: [{ messageId: 'shorter', data: { condition, form, reason } }] };
}

const NUMBER = 'export function f(n: number, x: number, a: boolean, b: boolean, c: boolean)';

tester.run('shorter-boolean-logic', rule, {
  valid: [
    typed(`${NUMBER} { return n > 3 && n < 5; }`),
    typed(`${NUMBER} { return !(n < 3) && n < 5; }`),
    typed(`${NUMBER} { return n < 5 || n >= 5; }`),
    typed(`${NUMBER} { return n > 5 && n > 3 && a; }`),
    typed(`${NUMBER} { return (a && b) || (b && c); }`),
    typed(`${NUMBER} { return (a && b) || (!a && c) || (b && c); }`),
    typed(
      'export function f(u: { n: number } | null) { return u !== null && (u.n > 3 || u.n < 1); }',
    ),
    typed(
      `${NUMBER} { return (x >= 0 && x < 10) || (x >= 10 && x < 20 && a) || (x >= 20 && x < 30 && b); }`,
    ),
    typed(`declare function g(): number; ${NUMBER} { return g() > 3 && g() > 5; }`),
    typed(`declare function g(): boolean; ${NUMBER} { return (g() && a) || (g() && !a); }`),
    typed(
      'export function f(p: number, q: number, r: number, s: number, t: number, u: number, v: number) {' +
        ' return (p > 1 && q > 1) || (p > 1 && !(q > 1)) || r > 1 || s > 1 || t > 1 || u > 1 || v > 1; }',
    ),
    typed(
      'export function f(user: { age: number } | null) { return user !== null && user.age > 1 && user.age > 0 && user.age > -1; }',
    ),
  ],
  invalid: [
    typed(
      'export function f(list: number[], i: number) { return i < list.length && list[i] > 0 && list[i] > 1; }',
      [
        'i < list.length && list[i] > 0 && list[i] > 1',
        'i < list.length && list[i] > 1',
        '`list[i] > 1` later in the same `&&` implies it',
      ],
    ),
    typed(`${NUMBER} { return n > 3 && n > 5; }`, [
      'n > 3 && n > 5',
      'n > 5',
      '`n > 5` later in the same `&&` implies it',
    ]),
    typed(`${NUMBER} { return n > 5 || n > 3; }`, [
      'n > 5 || n > 3',
      'n > 3',
      'it implies `n > 3` later in the same `||`',
    ]),
    typed(`${NUMBER} { return (a && b) || (a && !b); }`, [
      '(a && b) || (a && !b)',
      'a',
      '`a && b` and `a && !b` of the same `||` merge into one',
    ]),
    typed(`${NUMBER} { return (x >= 0 && x < 10) || (x >= 10 && x < 20); }`, [
      '(x >= 0 && x < 10) || (x >= 10 && x < 20)',
      'x >= 0 && x < 20',
      '`x >= 0 && x < 10` and `x >= 10 && x < 20` of the same `||` merge into one',
    ]),
    typed(`${NUMBER} { return (b && c) || (a && b) || (!a && c); }`, [
      '(b && c) || (a && b) || (!a && c)',
      'a && b || !a && c',
      'the other operands of the `||` already cover it',
    ]),
    typed(`${NUMBER} { if (n > 3 && a && n > 5) { run(); } function run() {} }`, [
      'n > 3 && a && n > 5',
      'a && n > 5',
      '`n > 5` later in the same `&&` implies it',
    ]),
    typed(
      'export function f(u: { n: number } | null) { return u !== null && u.n > 3 && u.n > 5; }',
      [
        'u !== null && u.n > 3 && u.n > 5',
        'u !== null && u.n > 5',
        '`u.n > 5` later in the same `&&` implies it',
      ],
    ),
    typed(`${NUMBER} { return !(n > 3 && n > 5); }`, [
      '!(n > 3 && n > 5)',
      '!(n > 5)',
      '`n > 5` later in the same `&&` implies it',
    ]),
  ],
});
