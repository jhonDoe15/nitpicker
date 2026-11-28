import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-filtered-positional-pairing.mts';

const tester = typescriptRuleTester();
const cases = (block: string) => block.trim().split('\n\n');

const PAIRED = (filtered: string) => ({ messageId: 'filteredPairing', data: { filtered } });

tester.run('no-filtered-positional-pairing', rule, {
  valid: cases(`
export function f(xs: string[]) { const unique = xs.filter((x) => x.length > 0); const sizes = sizesOf(unique);
  return unique.map((spec, index) => ({ spec, size: sizes[index] })); }
declare function sizesOf(xs: string[]): number[];

export function f(a: number[]) { const kept = a.filter(Boolean); const labels = kept.map(String);
  return kept.map((x, i) => use(x, labels[i])); }
declare function use(...xs: unknown[]): void;

export function f(a: number[], out: number[]) { const kept = a.filter(Boolean); for (let i = 0; i < kept.length;
  i++) out[i] = kept[i]! * 2; }

export function f(rows: Row[]) { return rows.filter((r) => r.ok).map((row, i) => use(row.cells[i])); }
declare function use(...xs: unknown[]): void;

export function f(rows: Row[]) { return rows.filter((r) => r.ok).map((row, i) => { const cells = row.slice();
  return use(cells[i]); }); }
declare function use(...xs: unknown[]): void;

const COLORS = ["red", "blue"];
export function f(series: Row[]) { return series.filter((s) => s.visible).map((s, i) => use(s, COLORS[i])); }
declare function use(...xs: unknown[]): void;

export function f(a: number[], b: number[]) { const ka = a.filter((x) => x>0); const kb = b.filter((x) => x > 0);
  return ka.map((x, i) => x + kb[i]!); }

export function f(a: number[], b: number[]) { return a.map((x, i) => x + b[i]!); }

export function f(a: number[], b: number[]) { const kept = a.filter((x) => x > 0); return kept.map((x) => x * 2); }

export function f(a: number[], b: number[]) { const ka = a.filter((x) => x > 0); const kb = b.filter((x) => x > 0);
  return ka.map((x, i) => x + kb[i]!); }

export function f(a: number[]) { const kept = a.filter((x) => x > 0); return kept.map((x, i) => x + kept[i]!); }

export function f(a: number[], b: number[]) { const pairs = a.map((x, i) => [x, b[i]!] as const);
  return pairs.filter(([x]) => x > 0); }

export function f(a: number[], b: number[]) { for (let i = 0; i < a.length; i++) { use(a[i], b[i]); } }
declare function use(...xs: unknown[]): void;

export function f(a: number[]) { const kept = a.filter((x) => x > 0); for (let i = 0; i < kept.length; i++) {
  use(kept[i]); } }
declare function use(...xs: unknown[]): void;

export function f(a: number[], b: number[]) { return zip(a, b); }
declare function zip<A, B>(a: A[], b: B[]): [A, B][];

export function f(a: number[], b: number[]) { const ka = a.sort(); const kb = b.sort();
  return ka.map((x, i) => x + kb[i]!); }

export function f(a: number[], b: number[], mode: "reverse") { const ka = a[mode](); const kb = b.sort();
  return ka.map((x, i) => x + kb[i]!); }

export function f(a: number[], b: number[], run: "map") { return a[run]((x, i) => x + b[i]!); }

export function f(a: number[], b: number[], n: number) { for (let i = 0; i < n; i++) { use(a[i], b[i]); } }
declare function use(...xs: unknown[]): void;

export function f(n: number) { for (;;) { if (n > 0) break; } }

export function f(a: number[], b: number[]) { for (let i = 0; i <= a.length; i++) { use(a[i], b[i]); } }
declare function use(...xs: unknown[]): void;

export function f(a: number[], b: number[]) { let i = 0; for (i = 0; i < a.length; i++) { use(a[i], b[i]); } }
declare function use(...xs: unknown[]): void;

export class Box { a: number[] = []; b: number[] = []; run() { for (let i = 0; i < this.a.length; i++) {
  use(this.a[i], this.b[i]); } } }
declare function use(...xs: unknown[]): void;
`),
  invalid: [
    {
      code: 'export function f(a: number[], b: number[]) { const ka = a.filter((x) => x > 0).map((x) => x * 2); return ka.map((x, i) => x + b[i]!); }',
      errors: [PAIRED('ka')],
    },
    {
      code: 'export function f(b: number[]) { const ka = load(); const kb = b.filter((y) => y > 0); return ka.map((x, i) => x + kb[i]!); }\ndeclare function load(): number[];',
      errors: [PAIRED('kb')],
    },
    {
      code: 'export function f(params: Type[], wanted: Type[]) { const declared = params.map(substitute).filter((kind) => !kind.isVariable); return declared.map((d, i) => unify(wanted[i]!, d)); }\ndeclare function substitute(t: Type): Type;\ndeclare function unify(a: Type, b: Type): void;',
      errors: [PAIRED('declared')],
    },
    {
      code: 'export function f(a: number[], b: number[]) { const kept = b.filter((y) => y > 0); a.forEach((x, i) => use(x, kept[i])); }\ndeclare function use(...xs: unknown[]): void;',
      errors: [PAIRED('kept')],
    },
    {
      code: 'export function f(a: number[], b: number[]) { const kept = a.filter((x) => x > 0); for (let i = 0; i < kept.length; i++) { use(kept[i], b[i]); } }\ndeclare function use(...xs: unknown[]): void;',
      errors: [PAIRED('kept')],
    },
    {
      code: 'import { zip } from "lodash";\nexport function f(a: number[], b: number[]) { return zip(a.filter((x) => x > 0), b); }',
      errors: [PAIRED('a.filter((x) => x > 0)')],
    },
    {
      code: 'export function f(a: number[], b: number[]) { const ka = a.filter((x) => x > 0); const kb = b.filter((x) => x < 0); return ka.map((x, i) => x + kb[i]!); }',
      errors: [PAIRED('ka')],
    },
  ],
});
