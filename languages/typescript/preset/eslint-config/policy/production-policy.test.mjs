import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { strictSyntaxConfigFor } from '../strict.mjs';
import { productionLayoutConfigFor, productionPolicyConfigFor } from './production-policy.mjs';

const layout = { ...defaultResolvedLayout, entryPoints: ['src/scripts/*.ts'] };

const RETURN_TYPE_RULE = '@typescript-eslint/explicit-module-boundary-types';

function allRuleIds(filename, code, { react = false } = {}) {
  const config = [
    ...productionPolicyConfigFor(layout, { react }),
    ...productionLayoutConfigFor(layout, { react }),
    ...strictSyntaxConfigFor(layout, { react }),
  ];
  return lintFixture({ config, filename, code })
    .map((message) => message.ruleId)
    .filter(Boolean);
}

function ruleIds(filename, code, options) {
  return allRuleIds(filename, code, options).filter((ruleId) => ruleId !== RETURN_TYPE_RULE);
}

function returnTypeFindings(filename, code, options) {
  return allRuleIds(filename, code, options).filter((ruleId) => ruleId === RETURN_TYPE_RULE);
}

const adapter = 'src/main/features/a/adapters/x.ts';
const domain = 'src/main/features/a/domain/x.ts';

describe('production policy scope', () => {
  it.each([
    ['a test file', 'src/main/features/a/x.test.ts'],
    ['a test root file', 'test/x.ts'],
  ])('does not apply to %s', (_name, file) => {
    expect(ruleIds(file, 'export const Bad_Name = 86400; process.exit(1);')).toEqual([]);
  });

  it('exempts entry points and config files from the process rules only', () => {
    const code = "export const port = process.env['PORT']; process.exit(1);";

    expect(ruleIds('src/scripts/run.ts', code)).toEqual([]);
    expect(ruleIds('src/app.config.ts', code)).toEqual([]);
    expect(ruleIds(adapter, code)).toEqual([
      'nitpicker/no-process-access-outside-composition-root',
      'nitpicker/no-process-access-outside-composition-root',
    ]);
  });

  it('keeps the module-state rule out of domain/', () => {
    const code = 'const cache = new Map(); export function put(k, v) { cache.set(k, v); }';

    expect(ruleIds(adapter, code)).toEqual(['nitpicker/no-module-level-mutable-state']);
    expect(ruleIds(domain, code)).not.toContain('nitpicker/no-module-level-mutable-state');
  });

  it('gives domain/ the clock message for Math.random and every other file the token message', () => {
    const code = 'export const roll = Math.random();';
    const message = (file) =>
      lintFixture({
        config: [...productionPolicyConfigFor(layout), ...strictSyntaxConfigFor(layout)],
        filename: file,
        code,
      })[0].message;

    expect(message(domain)).toBe(
      "'Math.random' is restricted from being used. domain/ code does not read the clock or randomness: take the time, ID or random value as a parameter from adapters/.",
    );
    expect(message(adapter)).toBe(
      "'Math.random' is restricted from being used. Math.random() is predictable, so it must not make ids or tokens: use crypto.randomUUID() or crypto.randomInt(), or take the random value as a parameter. For a simulation or UI jitter, add an exception for this rule in nitpicker.config.json.",
    );
  });

  it('reports a domain global once per use and leaves other layers alone', () => {
    const code = 'export function later(f) { setTimeout(f, 1); }';

    expect(ruleIds(domain, code)).toEqual(['no-restricted-globals']);
    expect(ruleIds(adapter, code)).toEqual([]);
  });
});

describe('identifier casing', () => {
  it.each([
    ['a snake_case type', 'export type order_line = { readonly a: number };'],
    ['a snake_case function', 'export function calculate_total() { return 1; }'],
    ['a mixed-case constant', 'export const Sub_Total = 5;'],
    ['a snake_case parameter', 'export function f(line_item: number) { return line_item; }'],
    ['a camelCase type parameter', 'export type Box<item> = { readonly value: item };'],
  ])('rejects %s', (_name, code) => {
    expect(ruleIds(adapter, code)).toEqual(['nitpicker/naming-convention']);
  });

  it.each([
    [
      'camelCase variables',
      'export const orderTotal = 5; export function sumUp(lineItem: number) { return lineItem; }',
    ],
    ['UPPER_CASE constants', 'export const MAX_RETRIES = 5;'],
    ['PascalCase types and type parameters', 'export type Box<TItem> = { readonly value: TItem };'],
    ['an Error subclass', 'export class ReadError extends Error {}'],
    [
      'external names read by destructuring',
      'export function f(row: { readonly user_id: string }) { const { user_id } = row; return user_id; }',
    ],
    [
      'leading underscores',
      'export function f(_unused: number, __dirname: string) { return __dirname; }',
    ],
  ])('allows %s', (_name, code) => {
    expect(ruleIds(adapter, code)).toEqual([]);
  });

  it.each([
    ['a zod schema constant', 'export const Order = z.object({ id: z.string() });'],
    ['a refined schema constant', 'export const Email = z.string().email().brand("Email");'],
    [
      'a component parameter',
      'export function withLog(Component: ComponentType) { return Component; }',
    ],
    [
      'a component parameter by name',
      'export function wrap(InnerComponent) { return InnerComponent; }',
    ],
  ])('allows PascalCase for %s', (_name, code) => {
    expect(ruleIds(adapter, code)).toEqual([]);
  });

  it('still rejects a PascalCase constant that is not a schema', () => {
    expect(ruleIds(adapter, 'export const Order = loadOrder();')).toEqual([
      'nitpicker/naming-convention',
    ]);
  });

  it('allows PascalCase functions and variables only in a React project', () => {
    const code = 'export function Button() { return 1; } export const Panel = Button;';

    expect(ruleIds(adapter, code, { react: true })).toEqual([]);
    expect(ruleIds(adapter, code)).toEqual([
      'nitpicker/naming-convention',
      'nitpicker/naming-convention',
    ]);
  });
});

describe('magic numbers and other basics', () => {
  it.each([
    ['a number in a condition', 'export function old(seconds: number) { return seconds > 86400; }'],
    ['a factor', 'export function gross(net: number) { return net * 1.17; }'],
    [
      'a number in a function inside a constant',
      'export const timers = { wait() { return sleep(5000); } };',
    ],
    ['a number in a module-level statement', 'schedule(86400);'],
    [
      'a status-sized number elsewhere',
      'export function f(xs: readonly number[]) { return xs.at(404); }',
    ],
  ])('rejects %s', (_name, code) => {
    expect(ruleIds(adapter, code)).toEqual(['nitpicker/no-magic-numbers']);
  });

  it.each([
    ['a named constant', 'export const LIMIT = 86400;'],
    [
      'the allowed small numbers',
      'export function f(xs: readonly number[]) { return xs.length > 2 ? xs[1] : -1; }',
    ],
    ['a default value', 'export function f(retries = 5) { return retries; }'],
    ['an object property', 'export const options = { timeoutMs: 5000 };'],
    ['an array index', 'export function f(xs: readonly number[]) { return xs[7]; }'],
    ['a computed module constant', 'export const DAY_MS = 24 * 60 * 60 * 1000;'],
    ['a constant list', 'export const CODES = [200, 404, 500] as const;'],
    ['a status code', 'export function f(res: Res) { return res.status(404); }'],
    ['a status property', "export function reply() { return new Response('', { status: 204 }); }"],
    ['rounding digits', 'export function f(x: number) { return x.toFixed(3); }'],
    ['percent scaling', 'export function f(x: number) { return Math.round(x * 100) / 100; }'],
  ])('allows %s', (_name, code) => {
    expect(ruleIds(adapter, code)).toEqual([]);
  });

  it.each([
    ['if (a) return 1;', 'curly'],
    ['export function f(n: number) { n = 2; return n; }', 'no-param-reassign'],
    ['eval("1");', 'no-eval'],
    [
      "import { a } from 'x'; import { b } from 'x'; export const c = [a, b];",
      'no-duplicate-imports',
    ],
    ['export const re = /^(a+)+$/;', 'regexp/no-super-linear-backtracking'],
  ])('rejects %s with %s', (code, rule) => {
    expect(ruleIds(adapter, code)).toContain(rule);
  });

  it('allows a separate type import next to a value import of the same module', () => {
    const code =
      "import { a } from 'x'; import type { B } from 'x'; export const c = [a]; export type D = B;";

    expect(ruleIds(adapter, code)).toEqual([]);
  });

  it('leaves UI folders under src/main to a React project', () => {
    const file = 'src/main/ui/Panel.ts';

    expect(ruleIds(file, 'export const panel = 1;')).toEqual(['nitpicker/no-unknown-main-folder']);
    expect(ruleIds(file, 'export const panel = 1;', { react: true })).toEqual([]);
  });

  it('requires a return type on exported production functions, components included', () => {
    const code = 'export function total(a: number) { return a + 1; }';
    const component = 'src/main/features/a/adapters/user-list.tsx';

    expect(returnTypeFindings(adapter, code)).toEqual([RETURN_TYPE_RULE]);
    expect(
      returnTypeFindings(component, 'export function UserList() { return 1; }', { react: true }),
    ).toEqual([RETURN_TYPE_RULE]);
    expect(
      returnTypeFindings(adapter, 'export function total(a: number): number { return a + 1; }'),
    ).toEqual([]);
    expect(returnTypeFindings('src/main/features/a/x.test.ts', code)).toEqual([]);
    expect(
      returnTypeFindings('src/main/features/a/adapters/x.mjs', 'export function f() { return 1; }'),
    ).toEqual([]);
  });

  it('lets domain/ use a date library on a given value but not read the clock through it', () => {
    expect(
      ruleIds(domain, 'export function day(at: string): number { return dayjs(at).day(); }'),
    ).toEqual([]);
    expect(ruleIds(domain, 'export function now(): number { return dayjs().valueOf(); }')).toEqual([
      'no-restricted-syntax',
    ]);
  });
});
