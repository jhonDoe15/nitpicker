import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-map-flat-', { lib: ['ES2023'] });
afterAll(cleanup);
const untyped = typescriptRuleTester();

const PRE = `export {}; interface Node { id: number; children: Node[] }
declare const xs: Node[]; declare const ro: readonly Node[]; declare const pair: [Node, Node];
declare const maybe: Node[] | undefined; declare const anything: any; declare const text: string;
declare const holder: { list: Node[] }; declare const ctx: object;
declare const stream: { map(f: (n: Node) => Node[]): { flat(): Node[] } };
declare function load(n: Node): Promise<Node[]>; declare function split(n: Node): Node[];
declare class Wrapper<T> { map<U>(f: (item: T) => U): Wrapper<U>; flat(): Wrapper<T>; }
declare const wrapped: Wrapper<Node>; declare const items: Float64Array;
declare const rows: ({ names: string[] } | { ids: number[] })[];
declare const tup: [string[], number[]]; declare const flag: boolean;`;

function program(expression: string) {
  return `${PRE} export const r = ${expression};`;
}

const mapFlat = [{ messageId: 'mapFlat' }];

function fixes(before: string, after: string) {
  return { ...typed(program(before), mapFlat), output: program(after) };
}

function declines(before: string) {
  return { ...typed(program(before), mapFlat), output: null };
}

tester.run('map flat fix', rule, {
  valid: [
    typed(program('xs.map(split).flat(2)')),
    typed(program('xs.map(split).flat(Infinity)')),
    typed(program('xs.flat()')),
    typed(program('xs.flatMap(split)')),
    typed(program('xs.map(split)')),
  ],
  invalid: [
    fixes('xs.map(split).flat()', 'xs.flatMap(split)'),
    fixes('xs.map(split).flat(1)', 'xs.flatMap(split)'),
    fixes('xs.map((n) => n.children).flat()', 'xs.flatMap((n) => n.children)'),
    fixes(
      'xs.map(function (n) { return this.k ? n.children : []; }, ctx).flat()',
      'xs.flatMap(function (n) { return this.k ? n.children : []; }, ctx)',
    ),
    fixes('xs.map(split, ctx).flat()', 'xs.flatMap(split, ctx)'),
    fixes('ro.map(split).flat()', 'ro.flatMap(split)'),
    fixes('pair.map(split).flat()', 'pair.flatMap(split)'),
    fixes('maybe?.map(split).flat()', 'maybe?.flatMap(split)'),
    fixes('holder.list.map(split).flat()', 'holder.list.flatMap(split)'),
    fixes('xs.map(split)\n  .flat()', 'xs.flatMap(split)'),
    fixes('xs.map(split).flat().length', 'xs.flatMap(split).length'),
    fixes('Promise.all(xs.map(load).flat())', 'Promise.all(xs.flatMap(load))'),
    fixes('[...xs, ...xs.map(split).flat()]', '[...xs, ...xs.flatMap(split)]'),
    fixes('tup.map((r) => r.length).flat()', 'tup.flatMap((r) => r.length)'),
    fixes('xs.map(async (n) => split(n)).flat()', 'xs.flatMap(async (n) => split(n))'),
    fixes('xs.filter((n) => n.id).map(split).flat()', 'xs.filter((n) => n.id).flatMap(split)'),
    fixes('xs.map(split).flat().map((n) => n.id)', 'xs.flatMap(split).map((n) => n.id)'),
    declines('anything.map(split).flat()'),
    declines('wrapped.map(split).flat()'),
    declines('stream.map(split).flat()'),
    declines('(maybe?.map(split)).flat()'),
    declines('xs.map(split) /* why */ .flat()'),
    declines('xs.map(split).flat(/* once */)'),
    declines('xs.map<Node[]>(split).flat()'),
    declines('xs.map(...[split]).flat()'),
    declines('xs.map(split)?.flat()'),
    declines('xs.map(split).flat?.()'),
    declines('xs.map?.(split).flat()'),
    declines('(xs.map(split)).flat()'),
    declines('(xs.map(split) as Node[][]).flat()'),
    declines("rows.map((r) => ('names' in r ? r.names : r.ids)).flat()"),
    declines('tup.map((r) => r).flat()'),
    declines('xs.map((n) => (n.id > 1 ? n.children : n)).flat()'),
    declines('xs.map((n) => (flag ? [n.id] : String(n.id))).flat()'),
    declines('xs.map((n) => (flag ? 1 : [n.id])).flat()'),
  ],
});

untyped.run('map flat fix without types', rule, {
  valid: [],
  invalid: [
    {
      filename: '/repo/src/main/features/billing/domain/totals.ts',
      code: 'const parts = items.map(split).flat();',
      errors: mapFlat,
      output: null,
    },
    {
      filename: '/repo/src/main/features/billing/domain/totals.mjs',
      code: 'const parts = items.map(split).flat(1);',
      errors: mapFlat,
      output: null,
    },
  ],
});
