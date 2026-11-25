import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-filtered-positional-pair.mts';

const ruleTester = typescriptRuleTester();

function failing(code: string) {
  return {
    code,
    errors: [{ messageId: 'filteredPositionalPair' as const }],
  };
}

ruleTester.run('no-filtered-positional-pair', rule, {
  valid: cases([
    'function pair(a: number[], b: number[]) { return a.map((x, i) => [x, b[i]]); }',
    'function pair(a: number[], b: number[]) { return a.flatMap((x, i) => [x, b[i]]); }',
    'function pair(a: number[], b: number[]) { a.forEach((x, i) => use(x, b[i])); }',
    'function pair(a: number[], b: number[]) { return a.reduce((acc, x, i) => acc + x * b[i], 0); }',
    'function pair(a: number[], b: number[]) { for (let i = 0; i < a.length; i++) { use(a[i], b[i]); } }',
    'function bothFiltered(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); const fb = b.filter((y) => y > 0); return fa.map((x, i) => [x, fb[i]]); }',
    'function bothFilteredInline(a: number[], b: number[]) { return a.filter(Boolean).map((x, i) => [x, b.filter(Boolean)[i]]); }',
    'function bothFilteredLoop(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); const fb = b.filter((y) => y > 0); for (let i = 0; i < fa.length; i++) { use(fa[i], fb[i]); } }',
    'function noIndex(a: number[]) { return a.filter((x) => x > 0).map((x) => x * 2); }',
    'function indexNotIndexing(a: number[]) { return a.filter((x) => x > 0).map((x, i) => ({ x, i })); }',
    'function sameArray(a: number[]) { const fa = a.filter((x) => x > 0); return fa.map((x, i) => [x, fa[i]]); }',
    'function sameArrayParam(a: number[]) { return a.filter((x) => x > 0).map((x, i, arr) => [x, arr[i]]); }',
    'function sameArrayLoop(a: number[]) { const fa = a.filter((x) => x > 0); for (let i = 0; i < fa.length; i++) { use(fa[i], fa[i]); } }',
    'function lookupByElement(a: string[], byKey: Record<string, number>) { return a.filter(Boolean).map((x, i) => [x, byKey[x], i]); }',
    'function lookupById(users: { id: string; active: boolean }[], byId: Record<string, number>) { return users.filter((u) => u.active).map((u, i) => [u, byId[u.id], i]); }',
    'function writeOutputForEach(a: number[]) { const out: number[] = []; a.filter((x) => x > 0).forEach((x, i) => { out[i] = x; }); return out; }',
    'function writeOutputLoop(a: number[]) { const fa = a.filter((x) => x > 0); const out: number[] = []; for (let i = 0; i < fa.length; i++) { out[i] = fa[i] * 2; } return out; }',
    'function nestedLoops(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); for (let i = 0; i < fa.length; i++) { for (let j = 0; j < b.length; j++) { use(fa[i], b[j]); } } }',
    'function reassignedToUnfiltered(a: number[], b: number[]) { let items = a.filter((x) => x > 0); items = a; return items.map((x, i) => [x, b[i]]); }',
    'function pairFirstThenFilter(a: number[], b: number[]) { return a.map((x, i) => [x, b[i]] as const).filter(([x]) => x > 0); }',
    'function reduceWithoutIndex(a: number[]) { return a.filter((x) => x > 0).reduce((acc, x) => acc + x, 0); }',
    'function shadowedIndex(a: number[], b: number[]) { return a.filter((x) => x > 0).map((x, i) => b.map((y, i) => [x, y, b[i]])); }',
  ]),
  invalid: [
    failing(
      'function pair(a: number[], b: number[]) { return a.filter((x) => x > 0).map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { return a.map((x) => x + 1).filter((x) => x > 0).map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { return a.filter((x) => x > 0).map((x) => x + 1).map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); return fa.map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0).map((x) => x * 2); return fa.map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); const alias = fa; return alias.map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); fa.forEach((x, i) => { use(x, b[i]); }); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); return fa.flatMap((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], weights: number[]) { const fa = a.filter((x) => x > 0); return fa.reduce((acc, x, i) => acc + x * weights[i], 0); }',
    ),
    failing(
      'function pair(a: number[], weights: number[]) { const fa = a.filter((x) => x > 0); return fa.reduceRight((acc, x, i) => acc + x * weights[i], 0); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); return b.map((y, i) => [y, fa[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { return b.map((y, i) => [y, a.filter((x) => x > 0)[i]]); }',
    ),
    failing(
      'function pair(a: number[], weights: number[]) { const fa = a.filter((x) => x > 0); return weights.reduce((acc, w, i) => acc + w * fa[i], 0); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); return fa.map((x, i) => [x, b.at(i)]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { return (a.filter((x) => x > 0) as number[]).map((x, i) => [x, b?.[i]!]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); return fa.map(function (this: unknown, x, i) { return [x, b[i]]; }); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { let items = a; items = items.filter((x) => x > 0); return items.map((x, i) => [x, b[i]]); }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); for (let i = 0; i < fa.length; i++) { use(fa[i], b[i]); } }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { for (let i = 0; i < b.length; i++) { use(a.filter((x) => x > 0)[i], b[i]); } }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); for (let i = fa.length - 1; i >= 0; i--) { use(fa[i], b[i]); } }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); let i = 0; for (i = 0; i < fa.length; i++) { use(fa[i], b[i]); } }',
    ),
    failing(
      'function pair(a: number[], b: number[]) { const fa = a.filter((x) => x > 0); for (let i = 0; i < fa.length; i++) { use(fa.at(i), b.at(i)); } }',
    ),
    failing(
      'function pair(a: number[], totals: number[]) { const fa = a.filter((x) => x > 0); for (let i = 0; i < fa.length; i++) { totals[i] += fa[i]; } }',
    ),
  ],
});
