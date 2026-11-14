import { decidedTester } from './test-support/decided-tester.mjs';
import { rule } from './no-decided-condition.mjs';

const { tester, typed, error } = decidedTester();

tester.run('no-decided-condition on accessors and getters', rule, {
  valid: [
    'declare function go(): void; export function a(x: { get a(): number }) { if (x.a > 1) { return; } if (x.a > 2) { go(); } }',
    'declare function go(): void; export class B { get a(): number { return Math.random(); } f() { if (this.a > 1) { return; } if (this.a > 2) { go(); } } }',
    'declare function go(): void; export function n() { let x = 5; const o = { get v() { x = 9; return 1; } }; o.v; if (x === 5) { go(); } }',
    'declare function go(): void; export function m(x: { n: number }) { const f = () => x.n; if (f() > 1) { return; } if (f() > 2) { go(); } }',
    'declare function go(): void; export function k(key: string, x: number) { const chosen = { [key]: x }[key]; if (chosen === undefined) { return; } if (chosen > 2) { go(); } }',
    'declare function go(): void; export function p(key: string, x: number) { if ({ [key]: x }[key] > 1) { return; } go(); }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'declare function go(): void; export function a(x: { a: number }) { if (x.a > 1) { return; } if (x.a > 2) { go(); } }',
      [
        error(
          'alwaysFalse',
          'x.a > 2',
          'line 1 returns when `x.a > 1` is true',
        ),
      ],
    ),
  ],
});
