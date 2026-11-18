import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-spread-copy-', { lib: ['ES2023'] });
const loose = typedCases('nitpicker-spread-copy-loose-', { lib: ['ES2023'], strict: false });
afterAll(cleanup);
afterAll(loose.cleanup);
const untyped = typescriptRuleTester();

const PRE = `export {}; interface Node { id: number }
declare const xs: number[]; declare const ro: readonly number[]; declare const nested: number[][];
declare const maybeList: number[] | undefined; declare const holes: (number | undefined)[];
declare const str: string; declare const bytes: Uint8Array; declare const floats: Float64Array;
declare const either: string | number[]; declare const anything: any; declare const rec: Record<string, number>;
declare const set: Set<number>; declare const maybeSet: Set<number> | undefined; declare const map: Map<string, number>;
declare const objects: Set<Node>; declare const ps: Promise<number>[]; declare const pending: Set<Promise<void>>;
declare function f<T>(items: T[]): T[]; declare function use(value: unknown): void;
declare const rest: number[][]; declare const pair: [number, number];`;

type Kind = 'new' | 'iterable';
const WHAT = {
  new: 'an array that is already new',
  iterable: 'an iterable that the receiver already takes',
};

function program(expression: string) {
  return `${PRE} export async function run() { return ${expression}; }`;
}

function errors(kind: Kind) {
  return [{ messageId: 'uselessSpread', data: { what: WHAT[kind] } }];
}

function fixes(before: string, after: string, kind: Kind = 'new') {
  return { ...typed(program(before), errors(kind)), output: program(after) };
}

function declines(before: string, kind: Kind = 'new') {
  return { ...typed(program(before), errors(kind)), output: null };
}

const sliceLike = [
  'slice(1)',
  'slice()',
  'concat([1])',
  'concat(2)',
  'concat(xs, 3)',
  'toSorted()',
  'toReversed()',
  'with(0, 1)',
  'toSpliced(0, 1)',
];

tester.run('spread copy fix of a new array', rule, {
  valid: [typed(program('[...xs]')), typed(program('[...xs, 1]')), typed(program('[...pair]'))],
  invalid: [
    fixes('[...Object.keys(rec)]', 'Object.keys(rec)'),
    fixes('[...Object.values(rec)]', 'Object.values(rec)'),
    fixes('[...Object.entries(rec)].map(([k]) => k)', 'Object.entries(rec).map(([k]) => k)'),
    fixes('[...Array.from(set)]', 'Array.from(set)'),
    fixes('[...Array.from(set, (n) => n * 2)]', 'Array.from(set, (n) => n * 2)'),
    fixes('[...Array.of(1, 2)]', 'Array.of(1, 2)'),
    fixes('[...[1, 2]]', '[1, 2]'),
    fixes('[...[...xs, 1]]', '[...xs, 1]'),
    {
      ...typed(program('[...[...Array.from(set)]]'), [...errors('new'), ...errors('new')]),
      output: program('[...Array.from(set)]'),
    },
    ...sliceLike.map((call) => fixes(`[...xs.${call}]`, `xs.${call}`)),
    ...sliceLike.map((call) =>
      fixes(
        `[...ro.${call.replace('toSpliced(0, 1)', 'slice(1)')}]`,
        `ro.${call.replace('toSpliced(0, 1)', 'slice(1)')}`,
      ),
    ),
    fixes('[...nested.flat()]', 'nested.flat()'),
    fixes('[...pair.slice(1)]', 'pair.slice(1)'),
    fixes('[...maybeList!.slice(1)]', 'maybeList!.slice(1)'),
    fixes('[...rest.concat(rest)]', 'rest.concat(rest)'),
    fixes('[...xs.concat(xs)].length', 'xs.concat(xs).length'),
    fixes('[...(await Promise.all(ps))]', 'await Promise.all(ps)'),
    fixes('[...(await Promise.all(ps))].map((n) => n)', '(await Promise.all(ps)).map((n) => n)'),
    fixes('[...(await Promise.allSettled(ps))].length', '(await Promise.allSettled(ps)).length'),
    fixes('f([...(await Promise.all(ps))])', 'f(await Promise.all(ps))'),
    fixes('use([...(await Promise.all(ps))])', 'use(await Promise.all(ps))'),
    fixes('{ list: [...(await Promise.all(ps))] }', '{ list: await Promise.all(ps) }'),
    fixes(
      '[1, ...(await Promise.all(ps))].length + [...(await Promise.all(ps))].length',
      '[1, ...(await Promise.all(ps))].length + (await Promise.all(ps)).length',
    ),
    fixes('new Set([...Object.keys(rec)])', 'new Set(Object.keys(rec))'),
    declines('[...str.slice(0, 3)]'),
    declines('[...str.concat("x")]'),
    declines('[...bytes.slice(1)]'),
    declines('[...bytes.toSorted()]'),
    declines('[...floats.toSorted()]'),
    declines('[...floats.with(0, 1)]'),
    declines('[...either.slice(1)]'),
    declines('[...anything.slice(1)]'),
    declines('[...anything.concat(1)]'),
    declines('[...holes.slice()]'),
    declines('[...holes.concat(xs)]'),
    declines('[...xs.concat(holes)]'),
    declines('[...xs.concat(anything)]'),
    declines('[...xs.concat(...rest)]'),
    declines('[...xs.concat(set)]'),
    declines('[...[, 1]]'),
    declines('[...(Object.keys(rec) as string[])]'),
    declines('[...maybeList?.slice(1)]'),
    declines('[...(await Promise.race(ps))]'),
    declines('[...(await Promise.any(ps))]'),
    declines('[/* keep */ ...Object.keys(rec)]'),
    declines('[...Object.keys(rec) /* keep */]'),
    declines('[...xs.slice(/* all */)]'),
    declines('[...xs.slice()] as const'),
    declines('[...Object.keys(rec)] as const'),
    declines('[...Object.keys(rec)] as string[]'),
    declines('<readonly number[]>[...xs.slice()]'),
    declines('[...xs.slice()] satisfies number[]'),
    declines('[...(await Promise.all([ps[0], str]))]'),
    declines('[...(await Promise.all([ps[0], str]))].length'),
    declines('[...pair.slice(0)] as const'),
    declines('[...new Array<number>(3).slice()]'),
    declines('[...Array(3).slice()]'),
    declines('[...(new Array<number>(3)).concat(xs)]'),
    declines('[...new Array<number>(xs.length).slice(1).concat(xs)]'),
    fixes(
      '[...Array.from({ length: 3 }, () => 1).slice()]',
      'Array.from({ length: 3 }, () => 1).slice()',
    ),
    fixes('[...new Array<number>(...xs).slice()]', 'new Array<number>(...xs).slice()'),
  ],
});

const shadowed = (name: string, body: string) =>
  `${PRE} export async function run(${name}: any) { return ${body}; }`;

const shadowedCases: [string, string, Kind][] = [
  ['Object', '[...Object.keys(rec)]', 'new'],
  ['Array', '[...Array.from(set)]', 'new'],
  ['Promise', '[...(await Promise.all(ps))]', 'new'],
  ['Set', 'new Set([...set])', 'iterable'],
  ['Promise', 'Promise.all([...pending])', 'iterable'],
  ['Array', 'Array.from([...set])', 'iterable'],
];

tester.run('spread copy fix of a shadowed global', rule, {
  valid: [],
  invalid: shadowedCases.map(([name, body, kind]) => ({
    ...typed(shadowed(name, body), errors(kind)),
    output: null,
  })),
});

tester.run('spread copy fix of an iterable argument', rule, {
  valid: [
    typed(program('new Set(set)')),
    typed(program('Array.from([...set], (n) => n)')),
    typed(program('new Set([...set, 1])')),
    typed(program('Promise.all([...pending, ...pending])')),
  ],
  invalid: [
    fixes('new Set([...set])', 'new Set(set)', 'iterable'),
    fixes('new Set([...xs])', 'new Set(xs)', 'iterable'),
    fixes('new Set([...str])', 'new Set(str)', 'iterable'),
    fixes('new Map([...map])', 'new Map(map)', 'iterable'),
    fixes('new Map([...map.entries()])', 'new Map(map.entries())', 'iterable'),
    fixes('new WeakSet([...objects])', 'new WeakSet(objects)', 'iterable'),
    fixes('Array.from([...set])', 'Array.from(set)', 'iterable'),
    fixes('Array.from([...(maybeSet ?? set)])', 'Array.from(maybeSet ?? set)', 'iterable'),
    fixes('Promise.all([...pending])', 'Promise.all(pending)', 'iterable'),
    fixes('Promise.allSettled([...ps])', 'Promise.allSettled(ps)', 'iterable'),
    fixes('Promise.race([...ps])', 'Promise.race(ps)', 'iterable'),
    fixes('Promise.any([...ps])', 'Promise.any(ps)', 'iterable'),
    fixes(
      'new Set([...(maybeSet as Set<number>)])',
      'new Set(maybeSet as Set<number>)',
      'iterable',
    ),
    declines('new Set([...maybeSet])', 'iterable'),
    declines('new Set([...anything])', 'iterable'),
    declines('new Set([...maybeSet!])'.replace('!', ' ?? anything'), 'iterable'),
    declines('new Set([/* copy */ ...set])', 'iterable'),
    fixes('new Map([...map] /* copy */)', 'new Map(map /* copy */)', 'iterable'),
    declines('Promise.all([...(maybeList ?? anything)])', 'iterable'),
  ],
});

const looseProgram = (expression: string) => program(expression);

loose.tester.run('spread copy fix without strict null checks', rule, {
  valid: [],
  invalid: [
    {
      ...loose.typed(looseProgram('new Set([...set])'), errors('iterable')),
      output: null,
    },
    {
      ...loose.typed(looseProgram('Promise.all([...pending])'), errors('iterable')),
      output: null,
    },
    {
      ...loose.typed(looseProgram('[...Object.keys(rec)]'), errors('new')),
      output: looseProgram('Object.keys(rec)'),
    },
  ],
});

const script = '/repo/src/main/features/billing/domain/totals.ts';

const untypedCases: [string, string | null, Kind][] = [
  ['const a = [...Object.keys(rec)];', 'const a = Object.keys(rec);', 'new'],
  ['const a = [...Array.from(set)];', 'const a = Array.from(set);', 'new'],
  ['const a = [...[1, 2]];', 'const a = [1, 2];', 'new'],
  ['const a = [...xs.slice(1)];', null, 'new'],
  ['const a = [...xs.concat(ys)];', null, 'new'],
  ['const a = [...xs.toSorted()];', null, 'new'],
  ['const a = new Set([...items]);', null, 'iterable'],
  ['const a = Array.from([...items]);', null, 'iterable'],
  ['async function f() { return Promise.all([...tasks]); }', null, 'iterable'],
];

untyped.run('spread copy fix without types', rule, {
  valid: [],
  invalid: untypedCases.map(([code, output, kind]) => ({
    filename: script,
    code,
    errors: errors(kind),
    output,
  })),
});
