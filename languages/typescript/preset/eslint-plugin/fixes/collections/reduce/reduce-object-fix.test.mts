import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/collections/no-accumulating-spread.mts';

const header = [
  'type Row = { id: string; label: string; n: number; tags: string[] };',
  'declare const key: string;',
  '',
].join('\n');
const { tester, typed } = typedCaseProject<{ messageId: string }[]>({
  prefix: 'nitpicker-reduce-object-',
  lib: ['ES2022'],
  header,
});
const lowLib = typedCaseProject<{ messageId: string }[]>({
  prefix: 'nitpicker-reduce-object-low-',
  lib: ['ES2017'],
  header,
});
const ERR = [{ messageId: 'reduceObject' }];

function fixes(code: string, output: string) {
  return { ...typed(code), errors: ERR, output: `${header}${output}` };
}

function declines(code: string) {
  return { ...typed(code), errors: ERR, output: null };
}

tester.run('no-accumulating-spread object fixes', rule, {
  valid: [],
  invalid: [
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, r.label]));',
    ),
    fixes(
      'export const a = (parameter?: Row[]) =>\n  (parameter || []).reduce((result, item) => ({ ...result, [item.id]: item.n }), {});',
      'export const a = (parameter?: Row[]) =>\n  Object.fromEntries((parameter || []).map((item) => [item.id, item.n]));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: 1 }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, 1]));',
    ),
    fixes(
      "export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, ['__proto__']: r.n }), {});",
      "export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => ['__proto__', r.n]));",
    ),
    fixes(
      "export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, ['a-b']: r.n }), {});",
      "export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => ['a-b', r.n]));",
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [7]: r.n }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [7, r.n]));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: function named() { return 1; } }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, function named() { return 1; }]));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: (() => 1)() }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, (() => 1)()]));',
    ),
    fixes(
      'export const a = (rows: Row[]) =>\n  rows.reduce((acc, r) => {\n    return { ...acc, [r.n]: r.id };\n  }, {});',
      'export const a = (rows: Row[]) =>\n  Object.fromEntries(rows.map((r) => {\n    return [r.n, r.id];\n  }));',
    ),
    fixes(
      'export const a = (rows: Row[]) =>\n  rows.reduce(function (acc, r) { return { ...acc, [r.id]: r }; }, {});',
      'export const a = (rows: Row[]) =>\n  Object.fromEntries(rows.map(function (r) { return [r.id, r]; }));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, { id, n }) => ({ ...acc, [id]: n }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map(({ id, n }) => [id, n]));',
    ),
    fixes(
      'export const a = (rows: readonly Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: [r.n, 1] }), {});',
      'export const a = (rows: readonly Row[]) => Object.fromEntries(rows.map((r) => [r.id, [r.n, 1]]));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [key]: (r.n, 1) }), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [key, (r.n, 1)]));',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {}).x;',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, r.label])).x;',
    ),
    fixes(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => (({ ...acc, [r.id]: r.label })), {});',
      'export const a = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.id, r.label]));',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {} as Record<string, string>);',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce<Record<string, string>>((acc, r) => ({ ...acc, [r.id]: r.label }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc: Record<string, string>, r) => ({ ...acc, [r.id]: r.label }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label, other: 1 }), {});',
    ),
    declines(
      'export const a = (rows: any[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [key as any]: r.n }), {});',
    ),
    declines(
      'declare const unknownKey: unknown;\nexport const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [unknownKey]: r.n }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: () => 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: (() => 1) }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: function () { return 1; } }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: (function () { return 1; }) }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: class {} }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: ((() => 1)) }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: async () => 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, ...{ [r.id]: r.label } }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ [r.id]: r.label, ...acc }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: (acc[r.id] ?? 0) + 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => { if (!r.n) return acc; return { ...acc, [r.id]: r.n }; }, {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), { first: 1 });',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduceRight((acc, r) => ({ ...acc, [r.id]: r.label }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows?.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});',
    ),
    declines(
      'export const a = (rows?: Row[]) => rows?.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {}).x;',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label /* why */ }), {});',
    ),
    declines(
      'export const a = (rows: (Row | undefined)[]) => rows.reduce((acc, r) => ({ ...acc, [r?.id ?? "-"]: 1 }), {});',
    ),
    declines(
      'export const a = (rows: any) => rows.reduce((acc: any, r: Row) => ({ ...acc, [r.id]: 1 }), {});',
    ),
    declines(
      'export const a = (rows: Set<Row>) => (rows as any).reduce((acc: any, r: Row) => ({ ...acc, [r.id]: 1 }), {});',
    ),
    declines(
      'declare const list: { reduce(f: (a: any, x: Row) => any, seed: object): object };\nexport const a = list.reduce((acc, r) => ({ ...acc, [r.id]: 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [{ toString: () => r.id }]: 1 }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, get [r.id]() { return 1; } }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]() { return 1; } }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce(function (acc, r) { return { ...acc, [r.id]: arguments.length }; }, {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce(async (acc, r) => ({ ...acc, [r.id]: await r.n }), {});',
    ),
    declines(
      'export const a = (rows: Row[]) => rows.reduce((acc, r): object => ({ ...acc, [r.id]: r.n }), {});',
    ),
    declines(
      'export const a = (Object: { fromEntries: unknown }, rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: 1 }), {});',
    ),
  ],
});

lowLib.tester.run('no-accumulating-spread object fixes without fromEntries', rule, {
  valid: [],
  invalid: [
    {
      ...lowLib.typed(
        'export const a = (rows: Row[]) => rows.reduce((acc, r) => ({ ...acc, [r.id]: 1 }), {});',
      ),
      errors: ERR,
      output: null,
    },
  ],
});

typescriptRuleTester().run('no-accumulating-spread object fixes without types', rule, {
  valid: [],
  invalid: [
    {
      code: 'rows.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});',
      errors: ERR,
      output: null,
    },
  ],
});
