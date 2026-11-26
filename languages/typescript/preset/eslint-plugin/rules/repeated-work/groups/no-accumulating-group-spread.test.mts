import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-accumulating-group-spread.mts';

const tester = typescriptRuleTester();

const COPIED = (target: string, key: string) => ({
  messageId: 'groupCopied',
  data: { target, key },
});

tester.run('no-accumulating-group-spread', rule, {
  valid: [
    'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { const group = groups.get(x.k); if (group) group.push(x); else groups.set(x.k, [x]); } }',
    'export function f(xs: Row[], groups: Map<string, Row[]>, defaults: Row[]) { for (const x of xs) { groups.set(x.k, [...defaults, x]); } }',
    'export function f(x: Row, groups: Map<string, Row[]>) { groups.set(x.k, [...(groups.get(x.k) ?? []), x]); }',
    'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { groups.set(x.k, [...(groups.get(x.other) ?? []), x]); } }',
    'export function f(xs: Row[], a: Map<string, Row[]>, b: Map<string, Row[]>) { for (const x of xs) { a.set(x.k, [...(b.get(x.k) ?? []), x]); } }',
    'export function f(groups: Map<string, string[]>) { for (const k of ["a", "b"]) { groups.set(k, [...(groups.get(k) ?? []), k]); } }',
    'export function f(groups: Map<string, string[]>) { ["a", "b"].forEach((k) => { groups.set(k, [...(groups.get(k) ?? []), k]); }); }',
    'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { groups.set(x.k, [x, ...(groups.get(x.k) ?? [])]); } }',
    'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { groups.set(x.k, [...(groups.get(x.k) ?? [x]), x]); } }',
    'export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] = [...(o[x.j] ?? []), x]; } }',
    'export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] ||= [...(o[x.k] ?? []), x]; } }',
  ],
  invalid: [
    {
      code: 'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { groups.set(x.k, [...(groups.get(x.k) ?? []), x] as Row[]); } }',
      errors: [COPIED('groups', 'x.k')],
    },
    {
      code: 'export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { groups.set(key(x), [...(groups.get(key(x)) ?? []), x]); } }',
      errors: [COPIED('groups', 'key(x)')],
    },
    {
      code: 'export function f(xs: Row[], groups: Map<string, Row[]>) { xs.forEach((x) => groups.set(x.k, [...(groups.get(x.k) || []), ...x.items])); }',
      errors: [COPIED('groups', 'x.k')],
    },
    {
      code: 'export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] = [...(o[x.k] ?? []), x]; } }',
      errors: [COPIED('o', 'x.k')],
    },
    {
      code: 'export function f(xs: Row[], groups: Map<string, Row[]>) { let i = 0; while (i < xs.length) { const x = xs[i++]!; groups.set(x.k, [...(groups.get(x.k)! ?? []), x]); } }',
      errors: [COPIED('groups', 'x.k')],
    },
  ],
});
