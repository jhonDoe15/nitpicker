import { rule } from '../no-decided-condition.mjs';
import { decidedTester } from '../test-support/decided-tester.mjs';

const { tester, typed, error } = decidedTester();

tester.run('no-decided-condition switch', rule, {
  valid: [
    'export function f(n: number) { switch (n) { case 1: case 2: return n === 1 ? 1 : 0; default: return 0; } }',
    'export function f(n: number) { switch (n) { case 1: n = 5; case 2: return n === 2 ? 1 : 0; } return 0; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'export function f(n: number) { switch (n) { case 1: return n === 1 ? 1 : 0; default: return n === 1 ? 2 : 3; } }',
      [
        error('alwaysTrue', 'n === 1', 'it is in the `case 1` arm of the `switch` on line 1'),
        error('alwaysFalse', 'n === 1', 'it is not `case 1` of the `switch` on line 1'),
      ],
    ),
    typed(
      'export function f(n: number) { if (n > 0) { switch (n) { case -1: return 1; } } return 0; }',
      [error('alwaysFalse', 'n === -1', 'it is inside the `if (n > 0)` on line 1')],
    ),
  ],
});
