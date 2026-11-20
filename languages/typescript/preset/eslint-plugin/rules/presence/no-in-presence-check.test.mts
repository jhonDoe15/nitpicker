import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-in-presence-check.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-in-presence-');
afterAll(cleanup);

function found(key: string, object: string) {
  return [{ messageId: 'inPresence', data: { key, object } }];
}

const FORM = 'type Form = { targetUID?: string; name: string };\n';

tester.run('no-in-presence-check', rule, {
  valid: [
    `${FORM}export function f(data: Form) { return data.targetUID !== undefined ? 1 : 2; }`,
    `${FORM}export function f(data: Form) { return 'name' in data ? 1 : 2; }`,
    `${FORM}export function f(data: Form) { if ('targetUID' in data && data.targetUID !== undefined) { return 1; ` +
      `} return 2; }`,
    `${FORM}export function f(data: Form) { if ('targetUID' in data && data.targetUID) { return 1; } return 2; }`,
    `${FORM}export function f(data: Form) { if (Object.hasOwn(data, 'targetUID')) { return 1; } return 2; }`,
    'type Circle = { kind: "c"; r: number }; type Square = { side: number };\nexport function f(s: Circle | ' +
      'Square) { if ("r" in s) { return s.r; } return s.side; }',
    'export function f(s: { a: number } | { b?: number }) { if ("a" in s) { return s.a; } return 0; }',
    'export function f(x: Record<string, number>) { return "k" in x ? 1 : 2; }',
    'export function f(x: unknown) { return typeof x === "object" && x !== null && "k" in x ? 1 : 2; }',
    'export function f(x: any) { return "k" in x ? 1 : 2; }',
    'type R = { contents: string } | { contents?: undefined; error: Error };\nexport function f(r: R) { return ' +
      '"contents" in r ? r.contents : undefined; }',
    `${FORM}export function f(data: Form) { const has = 'targetUID' in data; return has; }`,
    `${FORM}export function f(data: Form, key: string) { return key in data ? 1 : 2; }`,
    `${FORM}export function f(data: Form | undefined) { return data && 'name' in data; }`,
    `${FORM}export function f(c: Form) { return 'targetUID' in c ? c.targetUID : undefined; }`,
    `${FORM}export function f(c: Form) { if (!('targetUID' in c)) { throw new Error('missing'); } return 1; }`,
    `${FORM}export function f(c: Form) { if ('targetUID' in c) { if (typeof c.targetUID !== 'string') { return ` +
      `0; } } return 1; }`,
    `${FORM}export const a = (c: Form) => ('targetUID' in c ? c.targetUID : null);`,
    `${FORM}type W = { tool?: { displayName: string } }; export const g = (c: W) => ('tool' in c ? ` +
      `c.tool?.displayName : undefined);`,
    `${FORM}export function f(c: Form) { if (!('targetUID' in c)) { return false; } const v = c.targetUID; if ` +
      `(typeof v !== 'string') { return false; } return true; }`,
    `${FORM}export function f(c: Form) { if ('targetUID' in c) { const v = c.targetUID; if (v) { return v; } } ` +
      `return ''; }`,
  ].map((code) => typed(code)),
  invalid: [
    typed(
      `${FORM}declare const data: Form;\nexport const top = 'targetUID' in data ? data.targetUID : 'none';`,
      found('targetUID', 'data'),
    ),
    typed(
      `${FORM}export function f(data: Form) { if ('targetUID' in data) { return data.targetUID; } return 1; }`,
      found('targetUID', 'data'),
    ),
    typed(
      'type U = { _id?: string };\nexport function f(user: U | null) { return Boolean(user && ' +
        'Object.keys(user).length === 1 && "_id" in user); }',
      found('_id', 'user'),
    ),
    typed(
      'export function f(x: Record<string, string | undefined>) { return "k" in x ? 1 : 2; }',
      found('k', 'x'),
    ),
    typed(
      'type S = { a: number | undefined };\nexport function f(x: S) { return !("a" in x) ? 1 : 2; }',
      found('a', 'x'),
    ),
    typed(
      'type P = { a?: string; b?: string };\nexport function f(items: P[]) { return items.filter((p) => "a" in p); }',
      found('a', 'p'),
    ),
    typed(
      'type A = { a?: string }; type B = { a?: number; b: string };\nexport function f(x: A | B) { return "a" in ' +
        'x ? 1 : 2; }',
      found('a', 'x'),
    ),
  ],
});
