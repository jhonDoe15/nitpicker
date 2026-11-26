import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-filtered-positional-pairing.mts';

const tester = typescriptRuleTester();

const PAIRED = (filtered: string) => ({ messageId: 'filteredPairing', data: { filtered } });

tester.run('no-filtered-positional-pairing', rule, {
  valid: [
    'export function f(a: number[], b: number[]) { return a.map((x, i) => x + b[i]!); }',
    'export function f(a: number[], b: number[]) { const kept = a.filter((x) => x > 0); return kept.map((x) => x * 2); }',
    'export function f(a: number[], b: number[]) { const ka = a.filter((x) => x > 0); const kb = b.filter((x) => x > 0); return ka.map((x, i) => x + kb[i]!); }',
    'export function f(a: number[]) { const kept = a.filter((x) => x > 0); return kept.map((x, i) => x + kept[i]!); }',
    'export function f(a: number[], b: number[]) { const pairs = a.map((x, i) => [x, b[i]!] as const); return pairs.filter(([x]) => x > 0); }',
    'export function f(a: number[], b: number[]) { for (let i = 0; i < a.length; i++) { use(a[i], b[i]); } }\ndeclare function use(...xs: unknown[]): void;',
    'export function f(a: number[]) { const kept = a.filter((x) => x > 0); for (let i = 0; i < kept.length; i++) { use(kept[i]); } }\ndeclare function use(...xs: unknown[]): void;',
    'export function f(a: number[], b: number[]) { return zip(a, b); }\ndeclare function zip<A, B>(a: A[], b: B[]): [A, B][];',
  ],
  invalid: [
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
