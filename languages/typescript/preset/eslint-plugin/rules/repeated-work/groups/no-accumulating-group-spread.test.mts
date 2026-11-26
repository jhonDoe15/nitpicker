import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-accumulating-group-spread.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const COPIED = (target: string, key: string) => ({
  messageId: 'groupCopied',
  data: { target, key },
});

const EXPECTED = [
  [COPIED('groups', 'x.k')],
  [COPIED('groups', 'key(x)')],
  [COPIED('groups', 'x.k')],
  [COPIED('o', 'x.k')],
  [COPIED('groups', 'x.k')],
];

tester.run('no-accumulating-group-spread', rule, {
  valid: cases(`
export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) { const group = groups.get(x.k);
  if (group) group.push(x); else groups.set(x.k, [x]); } }

export function f(xs: Row[], groups: Map<string, Row[]>, defaults: Row[]) { for (const x of xs) {
  groups.set(x.k, [...defaults, x]); } }

export function f(x: Row, groups: Map<string, Row[]>) { groups.set(x.k, [...(groups.get(x.k) ?? []), x]); }

export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) {
  groups.set(x.k, [...(groups.get(x.other) ?? []), x]); } }

export function f(xs: Row[], a: Map<string, Row[]>, b: Map<string, Row[]>) { for (const x of xs) {
  a.set(x.k, [...(b.get(x.k) ?? []), x]); } }

export function f(groups: Map<string, string[]>) { for (const k of ["a", "b"]) {
  groups.set(k, [...(groups.get(k) ?? []), k]); } }

export function f(groups: Map<string, string[]>) { ["a", "b"].forEach((k) => {
  groups.set(k, [...(groups.get(k) ?? []), k]); }); }

export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) {
  groups.set(x.k, [x, ...(groups.get(x.k) ?? [])]); } }

export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) {
  groups.set(x.k, [...(groups.get(x.k) ?? [x]), x]); } }

export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] = [...(o[x.j] ?? []), x]; } }

export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] ||= [...(o[x.k] ?? []), x]; } }
`),
  invalid: cases(`
export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) {
  groups.set(x.k, [...(groups.get(x.k) ?? []), x] as Row[]); } }

export function f(xs: Row[], groups: Map<string, Row[]>) { for (const x of xs) {
  groups.set(key(x), [...(groups.get(key(x)) ?? []), x]); } }

export function f(xs: Row[], groups: Map<string, Row[]>) {
  xs.forEach((x) => groups.set(x.k, [...(groups.get(x.k) || []), ...x.items])); }

export function f(xs: Row[], o: Record<string, Row[]>) { for (const x of xs) { o[x.k] = [...(o[x.k] ?? []), x]; } }

export function f(xs: Row[], groups: Map<string, Row[]>) { let i = 0; while (i < xs.length) { const x = xs[i++]!;
  groups.set(x.k, [...(groups.get(x.k)! ?? []), x]); } }
`).map((code, index) => ({ code, errors: EXPECTED[index] ?? [] })),
});
