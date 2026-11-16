import { afterAll } from 'vitest';
import { typedCases, type CaseError } from '../../../test-support/typed-cases.mts';
import { rule } from '../no-decided-condition.mjs';

const { tester, cleanup, typed } = typedCases('nitpicker-decided-coercion-');
afterAll(cleanup);

function error(messageId: string, condition: string, reason: string): CaseError {
  return { messageId, data: { condition, reason } };
}

tester.run('no-decided-condition coercions', rule, {
  valid: [
    'export function f(x: boolean | undefined, n: number) { return x === undefined ? n : Boolean(n); }',
    'export function f(x: string | undefined) { return x ? x.length : 0; }',
    'export function f(x: boolean | undefined, y: boolean | undefined) { return x ? Boolean(y) : 0; }',
    'export function f(x: string | undefined) { return Boolean(x); }',
    'export function f(x: string | undefined) { return !!x && x.length > 0; }',
    'export function f(y: boolean | undefined) { return y ? (y = undefined, Boolean(y)) : 0; }',
    'export function f(x: string | undefined) { return x === undefined ? 0 : Boolean(x); }',
  ].map((code) => typed(code)),
  invalid: [
    typed(
      'export function f(x: boolean | undefined, n: number) { return x ? Boolean(x) : n !== 1; }',
      [error('coercionTrue', 'Boolean(x)', 'it is only reached when `x` is true')],
    ),
    typed('export function f(x: string | undefined) { return x ? !!x : 0; }', [
      error('coercionTrue', '!!x', 'it is only reached when `x` is true'),
    ]),
    typed('export function f(x: boolean) { return x ? 1 : Boolean(x); }', [
      error('coercionFalse', 'Boolean(x)', 'it is only reached when `x` is false'),
    ]),
    typed(
      'export function f(x: boolean | undefined) { if (x) { return Boolean(x); } return false; }',
      [error('coercionTrue', 'Boolean(x)', 'it is inside the `if (x)` on line 1')],
    ),
    typed(
      'type Props = { (): void; dependsOnOwnProps?: boolean }; export function f(mapToProps: Props) { return mapToProps.dependsOnOwnProps ? Boolean(mapToProps.dependsOnOwnProps) : mapToProps.length !== 1; }',
      [
        error(
          'coercionTrue',
          'Boolean(mapToProps.dependsOnOwnProps)',
          'it is only reached when `mapToProps.dependsOnOwnProps` is true',
        ),
      ],
    ),
    typed('export function f(x: string | undefined) { return x && Boolean(x); }', [
      error('coercionTrue', 'Boolean(x)', 'it is only reached when `x` is true'),
    ]),
  ],
});
