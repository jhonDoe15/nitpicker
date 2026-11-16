import { rule } from '../no-decided-condition.mts';
import { decidedTester } from '../test-support/decided-tester.mts';

const { tester, typed, error } = decidedTester();

tester.run('no-decided-condition assignments and arms with value models', rule, {
  valid: [
    'export function f(items: number[], k: number) { switch (k) { case 1: items.push(1); return items.length > 1 ? 1 : 0; default: return 0; } }',
    'export function f(items: number[]) { let n = 0; n = items.length; return n > 5 ? 1 : 2; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'export function f(items: string[]) { const min = 0; return items.length < min ? 1 : 2; }',
      [error('alwaysFalse', 'items.length < min', '`min` is set to `0` on line 1')],
    ),
    typed(
      'export function f(items: string[], k: number) { switch (k) { case 1: return k === 1 && items.length >= 0 ? 1 : 0; default: return items.length < 0 ? 2 : 3; } }',
      [
        error(
          'alwaysTrue',
          'k === 1 && items.length >= 0',
          'it is in the `case 1` arm of the `switch` on line 1',
        ),
        error(
          'alwaysFalse',
          'items.length < 0',
          'a size or length is a whole number, never negative',
        ),
      ],
    ),
  ],
});
