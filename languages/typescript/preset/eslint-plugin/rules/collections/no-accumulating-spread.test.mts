import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-accumulating-spread.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/adapters/ledger.ts';

function at(messageId: string, line: number, column: number, endColumn: number) {
  return { messageId, line, column, endLine: line, endColumn };
}

tester.run('no-accumulating-spread', rule, {
  valid: [
    'export const byId = (xs: readonly Row[]) => Object.fromEntries(xs.map((x) => [x.id, x]));',
    'export const all = (xs: readonly (readonly number[])[]) => xs.flatMap((x) => x);',
    'export const merged = (parts: readonly object[]) => Object.assign({}, ...parts);',
    'export const total = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0);',
    'xs.reduce((acc, x) => { acc.push(x); return acc; }, [])',
    'xs.reduce((acc, x) => ({ ...x }), {})',
    'xs.reduce((acc, x) => ({ ...other, x }), {})',
    'xs.reduce((acc, x) => [...(acc), x], [])',
    'xs.reduce((acc) => [...acc], [])',
    'xs.reduce((acc, x, index) => [...acc, x], [])',
    'xs.reduce((acc, x) => [...acc, x], [], extra)',
    'xs.reduce(({ list }, x) => [...list, x], [])',
    'xs.reduce((acc, x) => x.map(() => [...acc]), [])',
    'rows.map((row, index) => [...row, index]).reduce((sum, row) => sum + row.length, 0)',
    'xs.reduce((sum, x) => sum + x, rows.map((row, index) => [...row, index]).length)',
    'xs.reduce((a, b) => { const step = (acc, y) => [...acc, y]; return step(a, b); }, [])',
    'xs.map((acc, x) => [...acc, x])',
    'const out: number[] = []; for (const x of xs) { out.push(x); }',
    'let out = []; for (const x of xs) { out = out.concat(x); }',
    'let out = []; out = []; for (const x of xs) { out = [...out, x]; }',
    'for (let out = []; out.length < 3; ) { out = [...out, 1]; }',
    'var out = []; for (const x of xs) { out = [...out, x]; }',
    'let out = []; out = [...out, 1];',
    'let out = []; for (const x of xs) { other = [...out, x]; }',
    'xs.reduce((acc, x) => ({ ...acc, paid: acc.paid + x.v }), { paid: 0, open: 0 })',
    "xs.reduce((acc, x) => ({ ...acc, 'paid': 1, open() { return 0; } }), {})",
    'xs.reduce((acc, x) => [...acc, x].slice(-3), [])',
    'xs.reduce((acc, x) => [...acc, x].slice(0, 3), [])',
    'let last = []; for (const x of xs) { last = [...last, x].slice(-3); }',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n  out = [];\n}',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n}\nout = [];',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n  out = out.filter(keep);\n}',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n  out = other;\n}',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n}\nconst reset = () => { out = []; };',
    'let out = [];\nconst reset = () => { out = []; };\nfor (const x of xs) {\n  out = [...out, x];\n}',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n  out += 1;\n}',
    'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n}\n[out] = [[]];',
    'for (const x of xs) { m.set(x.k, [...defaults, x.v]); }',
    'for (const x of xs) { m.set(x.k, [...(other.get(x.k) ?? []), x.v]); }',
    'for (const x of xs) { m.set(x.k, [...(m.get(otherKey) ?? []), x.v]); }',
    'for (const x of xs) { o[x.k] = [...defaults, x.v]; }',
    'for (const x of xs) { o[x.k] = [...(other[x.k] ?? []), x.v]; }',
    'm.set(k, [...(m.get(k) ?? []), v]);',
    'o[k] = [...(o[k] ?? []), v];',
    "for (const k of ['a', 'b', 'c']) { m.set(k, [...(m.get(k) ?? []), 1]); }",
    "['a', 'b'].forEach((k) => { o[k] = [...(o[k] ?? []), 1]; });",
    "const KEYS = ['a', 'b'];\nfor (const k of KEYS) { m.set(k, [...(m.get(k) ?? []), 1]); }",
    'for (const row of rows) { const m = new Map<string, number[]>(); m.set(row.k, [...(m.get(row.k) ?? []), row.v]); }',
    'for (const x of xs) { m.set(x.k, [...(m.get(x.k) ?? []), x.v].slice(-3)); }',
    'for (const x of xs) { const group = m.get(x.k); if (group) { group.push(x.v); } else { m.set(x.k, [x.v]); } }',
  ].map((code) => ({ filename, code })),
  invalid: [
    {
      code: 'export const byId = (xs: readonly Row[]) =>\n  xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {});',
      errors: [at('reduceObject', 2, 28, 34)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, ...x], [] as number[])',
      errors: [at('reduceArray', 1, 24, 30)],
    },
    {
      code: 'xs.reduceRight(function (acc, x) { return [...acc, x]; }, [])',
      errors: [at('reduceArray', 1, 44, 50)],
    },
    {
      code: 'xs.reduce((acc, x) => new Set([...acc, x]), new Set<number>())',
      errors: [at('reduce', 1, 32, 38)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, x])',
      errors: [at('reduce', 1, 24, 30)],
    },
    {
      code: "xs?.['reduce']((acc = [], x) => { const next = [...acc, x]; return next; }, ([]))",
      errors: [at('reduceArray', 1, 49, 55)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, ...acc], [])',
      errors: [at('reduceArray', 1, 24, 30), at('reduceArray', 1, 32, 38)],
    },
    {
      code: 'let out: number[] = [];\nfor (const x of xs) {\n  out = [...out, x, ...out];\n}',
      errors: [at('loopArray', 3, 10, 16)],
    },
    {
      code: 'let merged = {};\nfor (const part of parts) {\n  merged = { ...merged, ...part } as Merged;\n}',
      errors: [at('loopObject', 3, 14, 23)],
    },
    {
      code: 'let out = [];\nwhile (more()) {\n  out = [f(...out), next()];\n}',
      errors: [at('loopArray', 3, 12, 18)],
    },
    {
      code: 'let [out] = [[]];\nfor (const x of xs) {\n  xs.map(() => { out = [...out, x]; });\n}',
      errors: [at('loopArray', 3, 25, 31)],
    },
    {
      code: 'xs.reduce((acc, x) => ({ ...acc, [x.id]: x }), {})',
      errors: [at('reduceObject', 1, 26, 32)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, x].slice(1), [])',
      errors: [at('reduceArray', 1, 24, 30)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, x].slice(-n), [])',
      errors: [at('reduceArray', 1, 24, 30)],
    },
    {
      code: 'let out: readonly unknown[] = [];\nfor (const x of xs) {\n  out = [...out, x];\n}\nfor (const y of ys) {\n  out = [...out, y];\n}',
      errors: [at('loopArray', 3, 10, 16), at('loopArray', 6, 10, 16)],
    },
    {
      code: 'let out = {};\nfor (const x of xs) {\n  out = { ...out, ...x };\n  out = [...out];\n}',
      errors: [at('loopObject', 3, 11, 17), at('loopArray', 4, 10, 16)],
    },
    {
      code: 'let out: readonly unknown[] = [];\nfor (const x of xs) {\n  if (x) out = [...out, x];\n  else out = [...out, 0];\n}',
      errors: [at('loopArray', 3, 17, 23), at('loopArray', 4, 15, 21)],
    },
    {
      code: 'let out: readonly unknown[] = [];\nfor (const x of xs) {\n  out = [...out, x];\n  out.length = 0;\n  out[0] = 1;\n}\nout.extra = 1;',
      errors: [at('loopArray', 3, 10, 16)],
    },
    {
      code: 'let out = [];\nconst keep = () => out;\nfor (const x of xs) {\n  out = [...out, x];\n}',
      errors: [at('loopArray', 4, 10, 16)],
    },
    {
      code: 'for (const x of xs) {\n  m.set(x.k, [...(m.get(x.k) ?? []), x.v]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (const x of xs) {\n  m.set(x.k, [...(m.get(x.k) || []), ...x.vs]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (const x of xs) {\n  m.set(x.k, [x.v, ...(m.get(x.k) ?? [])]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (const x of xs) {\n  const prev = m.get(x.k) ?? [];\n  m.set(x.k, [...prev, x.v]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (const x of xs) {\n  const prev = m.get(x.k);\n  m.set(x.k, [...(prev ?? []), x.v]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'while (more()) {\n  const x = next();\n  m.set(x.k, [...(m.get(x.k) ?? []), x.v]);\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'do {\n  m.set(k, [...(m.get(k) ?? []), next()]);\n} while (more());',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (let i = 0; i < xs.length; i += 1) {\n  o[xs[i].k] = [...(o[xs[i].k] ?? []), xs[i].v];\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'for (const k in src) {\n  o[k] = [...(o[k] || []), ...src[k]];\n}',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'xs.forEach((x) => {\n  m.set(x.k, [...(m.get(x.k) ?? []), x.v]);\n});',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'xs.map((x) => {\n  o[x.k] = [x.v, ...(o[x.k] ?? [])];\n  return x;\n});',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: 'xs.reduce((acc, x) => {\n  acc.set(x.k, [...(acc.get(x.k) ?? []), x.v]);\n  return acc;\n}, new Map());',
      errors: [{ messageId: 'keyedArray' }],
    },
    {
      code: "for (const row of rows) {\n  for (const k of ['a', 'b']) {\n    m.set(k, [...(m.get(k) ?? []), row[k]]);\n  }\n}",
      errors: [{ messageId: 'keyedArray' }],
    },
  ].map((testCase) => ({ filename, ...testCase })),
});

const domain = '/repo/src/main/features/billing/domain/totals.ts';

tester.run('no-accumulating-spread in domain/', rule, {
  valid: [{ filename: domain, code: 'xs.reduce((acc, x) => [...acc, x].slice(-3), [])' }],
  invalid: [
    {
      code: 'xs.reduce((acc, x) => ({ ...acc, ...x }), {})',
      errors: [at('domainReduceObject', 1, 26, 32)],
    },
    {
      code: 'xs.reduce((acc, x) => [...acc, x], [])',
      errors: [at('domainReduceArray', 1, 24, 30)],
    },
    {
      code: 'xs.reduce((acc, x) => new Set([...acc, x]))',
      errors: [at('domainReduce', 1, 32, 38)],
    },
    {
      code: 'let out = {};\nfor (const x of xs) {\n  out = { ...out, ...x };\n}',
      errors: [at('domainLoopObject', 3, 11, 17)],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n}',
      errors: [at('domainLoopArray', 3, 10, 16)],
    },
    {
      code: 'xs.forEach((x) => {\n  m.set(x.k, [...(m.get(x.k) ?? []), x.v]);\n});',
      errors: [{ messageId: 'domainKeyedArray' }],
    },
  ].map((testCase) => ({ filename: domain, ...testCase })),
});
