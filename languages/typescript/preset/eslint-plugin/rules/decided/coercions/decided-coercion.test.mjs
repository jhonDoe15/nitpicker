import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from '../no-decided-condition.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-decided-coercion-')));
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
