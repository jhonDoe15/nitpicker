import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-accumulating-spread.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/billing/adapters/ledger.ts';

function at(messageId, line, column, endColumn) {
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
      errors: [at('loopArray', 1, 5, 8)],
    },
    {
      code: 'let merged = {};\nfor (const part of parts) {\n  merged = { ...merged, ...part } as Merged;\n}',
      errors: [at('loopObject', 1, 5, 11)],
    },
    {
      code: 'let out = [];\nwhile (more()) {\n  out = [f(...out), next()];\n}',
      errors: [at('loopArray', 1, 5, 8)],
    },
    {
      code: 'let [out] = [[]];\nfor (const x of xs) {\n  xs.map(() => { out = [...out, x]; });\n}',
      errors: [at('loopArray', 1, 5, 10)],
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
      errors: [at('domainLoopObject', 1, 5, 8)],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = [...out, x];\n}',
      errors: [at('domainLoopArray', 1, 5, 8)],
    },
  ].map((testCase) => ({ filename: domain, ...testCase })),
});
