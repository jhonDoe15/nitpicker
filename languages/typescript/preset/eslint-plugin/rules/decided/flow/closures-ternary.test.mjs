import { decidedTester } from '../test-support/decided-tester.mjs';
import { rule } from '../no-decided-condition.mjs';

const { tester, typed, error } = decidedTester();

tester.run('no-decided-condition flow', rule, {
  valid: [
    'export function f(n: number) { return n > 5 ? 1 : n > 3 ? 2 : 3; }',
    'export function f(n: number) { let m = n; m = 1; if (m > 5) { return () => (m > 3 ? 1 : 0); } return null; }',
    'export function f(o: { n: number }) { if (o.n > 5) { return () => (o.n > 3 ? 1 : 0); } return null; }',
    'export function f(n: number) { if (n > 5) { return (n: number) => (n > 3 ? 1 : 0); } return null; }',
    'export function f(n: number) { if (n > 5) { n = 1; } return () => (n > 3 ? 1 : 0); }',
    'export function f(n: number, g: () => void) { let m = n; if (m > 5) { g(); } return () => { m = 0; return m > 3 ? 1 : 0; }; }',
  ].map((code) => typed(code)),
  invalid: [
    typed('export function f(x: number) { return x > 5 ? (x > 3 ? 1 : 2) : 3; }', [
      error('alwaysTrue', 'x > 3', 'it is in the true branch of the conditional `x > 5` on line 1'),
    ]),
    typed('export function f(x: number) { return x > 5 ? 1 : (x > 7 ? 2 : 3); }', [
      error(
        'alwaysFalse',
        'x > 7',
        'it is in the false branch of the conditional `x > 5` on line 1',
      ),
    ]),
    typed(
      'export function f(n: number) { if (n > 5) { return () => (n > 3 ? 1 : 0); } return null; }',
      [error('alwaysTrue', 'n > 3', 'it is inside the `if (n > 5)` on line 1')],
    ),
    typed(
      'declare function run(f: () => number): void; export function f(n: number) { if (n > 5) { run(() => { if (n > 3) { return 1; } return 0; }); } }',
      [error('alwaysTrue', 'n > 3', 'it is inside the `if (n > 5)` on line 1')],
    ),
  ],
});
