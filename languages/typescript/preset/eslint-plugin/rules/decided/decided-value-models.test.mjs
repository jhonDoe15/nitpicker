import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-decided-condition.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-decided-models-')));
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

const NEVER_NEGATIVE = 'a size or length is a whole number, never negative';

tester.run('no-decided-condition value models', rule, {
  valid: [
    'export function f(items: number[]) { if (items.length > 1) return 1; return items.length > 0 ? 2 : 3; }',
    'export function f(box: { length: number }) { return box.length < 0 ? 1 : 2; }',
    'export function f(x: number) { return Math.abs(x) > 0 ? 1 : 2; }',
    'export function f(a: string[]) { if (a.length > 1) { a.push("x"); } return a.length > 5 ? 1 : 2; }',
    'export function f(s: string) { return s.indexOf("a") < 0 ? 1 : 2; }',
    'export function f(n: number) { return Math.random() < 0.5 && Math.random() > 0.5 ? 1 : 2; }',
  ].map((code) => typed(code)),
  invalid: [
    typed('export function f(items: number[]) { return items.length < 0 ? 1 : 2; }', [
      error('alwaysFalse', 'items.length < 0', NEVER_NEGATIVE),
    ]),
    typed('export function f(m: Map<string, number>) { return m.size >= 0 ? 1 : 2; }', [
      error('alwaysTrue', 'm.size >= 0', NEVER_NEGATIVE),
    ]),
    typed(
      'export function f(items: number[]) { return items.length < 1 && items.length > 0 ? 1 : 2; }',
      [error('alwaysFalse', 'items.length < 1 && items.length > 0', NEVER_NEGATIVE)],
    ),
    typed('export function f(s: string) { return s.indexOf("a") < -1 ? 1 : 2; }', [
      error('alwaysFalse', 's.indexOf("a") < -1', 'an index search returns -1 or a position'),
    ]),
    typed('export function f(x: number) { return Math.abs(x) < 0 ? 1 : 2; }', [
      error('alwaysFalse', 'Math.abs(x) < 0', 'an absolute value is never negative'),
    ]),
    typed('export function f() { return Math.random() >= 1 ? 1 : 2; }', [
      error('alwaysFalse', 'Math.random() >= 1', 'a random number is at least 0 and below 1'),
    ]),
    typed(
      'export function f(items: string[]) { if (items.length === 0) return 0; return items.length < 1 ? 1 : 2; }',
      [
        error(
          'alwaysFalse',
          'items.length < 1',
          'line 1 returns when `items.length === 0` is true',
        ),
      ],
    ),
    typed(
      'export function f(items: string[]) { if (items.length - 1 < 0) return 0; return items.length > 0 ? 1 : 2; }',
      [
        error(
          'alwaysTrue',
          'items.length > 0',
          'line 1 returns when `items.length - 1 < 0` is true',
        ),
      ],
    ),
  ],
});
