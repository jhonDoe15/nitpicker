import { rule } from '../no-decided-condition.mts';
import { decidedTester } from '../test-support/decided-tester.mts';

const { tester, typed, error } = decidedTester();
const ALWAYS_FALSE = 'alwaysFalse';

tester.run('no-decided-condition assertions', rule, {
  valid: [
    'declare function assert(c: unknown): void; export function f(n: number) { assert(n > 0); return n <= 0 ? 1 : 2; }',
    'declare const console: { assert(c: unknown): void }; export function f(n: number) { console.assert(n > 0); return n <= 0 ? 1 : 2; }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'import assert from "node:assert"; export function f(n: number) { assert(n > 0); return n <= 0 ? 1 : 2; }',
      [error(ALWAYS_FALSE, 'n <= 0', 'line 1 throws unless `n > 0`')],
    ),
    typed(
      'import assert from "node:assert"; export function f(n: number) { assert.ok(n > 0); return n <= 0 ? 1 : 2; }',
      [error(ALWAYS_FALSE, 'n <= 0', 'line 1 throws unless `n > 0`')],
    ),
    typed(
      'import assert from "node:assert"; export function f(n: number) { assert.strictEqual(n, 5); return n > 3 ? 1 : 2; }',
      [error('alwaysTrue', 'n > 3', 'line 1 throws unless `n === 5`')],
    ),
    typed(
      'function must(c: unknown): asserts c { if (!c) throw new Error("no"); } export function f(n: number) { must(n > 0); return n <= 0 ? 1 : 2; }',
      [error(ALWAYS_FALSE, 'n <= 0', 'line 1 throws unless `n > 0`')],
    ),
  ],
});
