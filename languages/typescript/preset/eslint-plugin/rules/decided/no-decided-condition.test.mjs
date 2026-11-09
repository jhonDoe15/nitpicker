import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-decided-condition.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-decided-condition-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
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
  return { messageId, data: reason === undefined ? { condition } : { condition, reason } };
}

const declarations =
  'declare const user: { active: boolean } | undefined; declare function load(): void;\n';

tester.run('no-decided-condition', rule, {
  valid: [
    'export function f(count: number) { if (count > 10) return "many"; if (count > 5) return "some"; return "few"; }',
    'export function f(count: number) { if (count > 10) return 1; count = 30; if (count > 20) return 2; return 0; }',
    'export function f(a: string, b: string) { if (a < b) return 1; if (b > a) return 2; return 0; }',
    `${declarations}export function f() { if (user === undefined) return; load(); if (user.active) return; }`,
    'export function f(xs: number[]) { for (const x of xs) { if (x > 3) continue; if (x > 1) return x; } return 0; }',
    'declare function load(): void; export function f(n: number) { let i = n; while (i > 0) { i -= 1; if (i > 0) { load(); } } return i; }',
    'type Hover = { type: "arrow"; anchor: number } | { type: "text" }; export function same(a: Hover, b: Hover) { if (a.type !== b.type) return false; return a.type !== "arrow" || b.type !== "arrow" || a.anchor === b.anchor; }',
    'export function f(a: boolean, b: boolean) { if (!a && !b) return 0; if (a) return 1; if (b) return 2; return 3; }',
    'export function f(a: { b: boolean }) { if (a.b || a.b) return 1; return 0; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'export function f(count: number) { if (count > 10) return "many"; if (count > 20) return "lots"; return "few"; }',
      [error('alwaysFalse', 'count > 20', 'line 1 returns when `count > 10` is true')],
    ),
    typed(
      `${declarations}export function f() { if (user === undefined) return; if (user !== undefined && user.active) load(); }`,
      [
        error(
          'alwaysTrue',
          'user !== undefined',
          'line 2 returns when `user === undefined` is true',
        ),
      ],
    ),
    typed(
      'export function f(a: boolean, b: boolean, c: boolean) { if (a && b) { return 1; } else if (a) { return 2; } else if (a && c) { return 3; } return 0; }',
      [error('alwaysFalse', 'a', 'it is inside the `else` of the `if (a)` on line 1')],
    ),
    typed(
      'export function f(n: number) { let i = n; while (i > 0) { if (i > 0) { i -= 1; } } return i; }',
      [error('alwaysTrue', 'i > 0', 'the loop on line 1 only runs while `i > 0`')],
    ),
    typed('export function f(ready: boolean) { if (ready) { return ready ? 1 : 2; } return 0; }', [
      error('alwaysTrue', 'ready', 'it is inside the `if (ready)` on line 1'),
    ]),
    typed(
      'export const f = (ready: boolean) => { if (ready) { return 1; } return ready ? 2 : 3; };',
      [error('alwaysFalse', 'ready', 'line 1 returns when `ready` is true')],
    ),
    typed(
      'export function f(kind: string) { if (kind === "a") { return kind === "b" ? 1 : 2; } return 0; }',
      [error('alwaysFalse', 'kind === "b"', 'it is inside the `if (kind === "a")` on line 1')],
    ),
  ],
});
