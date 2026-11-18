import { rule } from '../no-decided-condition.mts';
import { decidedTester } from '../test-support/decided-tester.mts';

const { tester, typed, error } = decidedTester();

tester.run('no-decided-condition assignments', rule, {
  valid: [
    'export function f(n: number) { let x = 0; if (n > 1) { x = n; } return x === 0 ? 1 : 2; }',
    'declare function bump(): void; let shared = 0; export function f() { shared = 0; bump(); return shared === 0 ? 1 : 2; }',
    'export function f(xs: number[]) { let x = 0; for (const v of xs) { if (x === 0) { x = v; } } return x; }',
    'export function f(n: number, m: number) { const y = m; return y > 1 ? 1 : 0; }',
  ].map((code) => typed(code)),
  invalid: [
    typed('export function f() { const limit = 10; return limit === 10 ? 1 : 2; }', [
      error('alwaysTrue', 'limit === 10', '`limit` is set to `10` on line 1'),
    ]),
    typed(
      'export function f(s: string) { let mode = "a"; mode = "b"; return mode === "a" ? 1 : 2; }',
      [error('alwaysFalse', 'mode === "a"', '`mode` is set to `"b"` on line 1')],
    ),
  ],
});
