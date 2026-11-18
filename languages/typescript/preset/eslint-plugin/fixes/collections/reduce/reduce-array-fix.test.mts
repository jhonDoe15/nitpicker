import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/collections/no-accumulating-spread.mts';

const header = [
  'type Row = { id: string; n: number; tags: string[]; items: readonly Row[]; maybe?: string[]; either: string[] | number[] };',
  'declare const first: string;',
  '',
].join('\n');
type Errors = { messageId: string }[];
const { tester, typed } = typedCaseProject<Errors>({
  prefix: 'nitpicker-reduce-array-',
  lib: ['ES2022'],
  header,
});
const lowLib = typedCaseProject<Errors>({
  prefix: 'nitpicker-reduce-array-low-',
  lib: ['ES2017'],
  header,
});
const ERR = [{ messageId: 'reduceArray' }];

function fixes(code: string, output: string) {
  return { ...typed(code), errors: ERR, output: `${header}${output}` };
}

function declines(code: string) {
  return { ...typed(code), errors: ERR, output: null };
}

function fn(body: string, parameters = 'rows: Row[]') {
  return `export const a = (${parameters}) => ${body};`;
}

tester.run('no-accumulating-spread array fixes', rule, {
  valid: [],
  invalid: [
    {
      ...typed(fn('rows.reduce((acc, r) => [...acc, ...acc], [])')),
      errors: [...ERR, ...ERR],
      output: null,
    },
    fixes(fn('rows.reduce((acc, r) => [...acc, r.id], [])'), fn('rows.map((r) => r.id)')),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, ...r.tags], [])'),
      fn('rows.flatMap((r) => r.tags)'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, ...r.items], [])'),
      fn('rows.flatMap((r) => r.items)'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, r.id.toUpperCase()], [])'),
      fn('rows.map((r) => r.id.toUpperCase())'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, r.id, r.n], [])'),
      fn('rows.flatMap((r) => [r.id, r.n])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, r.id, ...r.tags], [])'),
      fn('rows.flatMap((r) => [r.id, ...r.tags])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, ...new Set(r.tags), r.id], [])'),
      fn('rows.flatMap((r) => [...new Set(r.tags), r.id])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, { id: r.id }], [])'),
      fn('rows.map((r) => ({ id: r.id }))'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, [r.id, r.n]], [])'),
      fn('rows.map((r) => [r.id, r.n])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, (r.n, r.id)], [])'),
      fn('rows.map((r) => (r.n, r.id))'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, ...(r.maybe ?? [])], [])'),
      fn('rows.flatMap((r) => r.maybe ?? [])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, ...r.tags.filter(Boolean)], [])'),
      fn('rows.flatMap((r) => r.tags.filter(Boolean))'),
    ),
    fixes(
      fn('rows.reduce((acc, { id, n }) => [...acc, id, n], [])'),
      fn('rows.flatMap(({ id, n }) => [id, n])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => {\n  return [...acc, r.id];\n}, [])'),
      fn('rows.map((r) => {\n  return r.id;\n})'),
    ),
    fixes(
      fn('rows.reduce(function (acc, r) { return [...acc, ...r.tags]; }, [])'),
      fn('rows.flatMap(function (r) { return r.tags; })'),
    ),
    fixes(
      fn('(rows ?? []).reduce((acc, r) => [...acc, r.id], [])'),
      fn('(rows ?? []).map((r) => r.id)'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => [...acc, r.id], [])', 'rows: readonly Row[]'),
      fn('rows.map((r) => r.id)', 'rows: readonly Row[]'),
    ),
    fixes(
      fn('rows\n  .filter((r) => r.n)\n  .reduce((acc, r) => [...acc, r.id], [])'),
      fn('rows\n  .filter((r) => r.n)\n  .map((r) => r.id)'),
    ),
    declines(fn('rows.reduce((acc, r) => [...acc, ...new Set(r.tags)], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...r.id], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...r.either], [])')),
    declines(fn('new Array<Row>(3).reduce((acc, r) => [...acc, r.id], [])')),
    declines(fn('Array<Row>(3).reduce((acc, r) => [...acc, ...r.tags], [])')),
    declines(fn('new Array<Row>(rows.length).slice(1).reduce((acc, r) => [...acc, r.id], [])')),
    fixes(
      fn('Array.from({ length: 3 }, () => rows[0]!).reduce((acc, r) => [...acc, r.id], [])'),
      fn('Array.from({ length: 3 }, () => rows[0]!).map((r) => r.id)'),
    ),
    declines(fn('rows.reduce((acc, r) => [...acc, ...(r as any).items], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...new Map([[r.id, r.n]])], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...[r.maybe, r.id]], [])')),
    declines(fn('rows.reduce((acc, r) => [...r.tags, ...acc], [])')),
    declines(fn('rows.reduce((acc, r) => [r.id, ...acc], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, acc.length], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, , r.id], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, r.id], [first])')),
    declines(fn('rows.reduce((acc, r) => [...acc, r.id], [] as string[])')),
    declines(fn('rows.reduce<string[]>((acc, r) => [...acc, r.id], [])')),
    declines(fn('rows.reduce((acc: string[], r) => [...acc, r.id], [])')),
    declines(fn('rows.reduceRight((acc, r) => [...acc, r.id], [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, r.id].slice(1), [])')),
    declines(fn('rows.reduce((acc, r) => (r.n ? [...acc, r.id] : acc), [])')),
    declines(fn('rows.reduce((acc, r) => { if (!r.n) return acc; return [...acc, r.id]; }, [])')),
    declines(fn('rows.reduce((acc, r) => [...acc, r.id /* why */], [])')),
    declines(fn('rows?.reduce((acc, r) => [...acc, r.id], [])')),
    declines(fn('rows?.reduce((acc, r) => [...acc, r.id], []).length', 'rows?: Row[]')),
    declines(fn('rows.reduce((acc, r) => [...acc, r?.id], [])', 'rows: (Row | undefined)[]')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...r.tags], [])', 'rows: any')),
    declines(fn('rows.reduce((acc, r) => [...acc, ...r.items], [])', 'rows: Set<Row>')),
    declines(fn('rows.reduce(function (acc, r) { return [...acc, arguments.length]; }, [])')),
    declines(fn('rows.reduce(async (acc, r) => [...acc, await r.id], [])')),
    declines(
      fn(
        'rows.reduce((acc, r) => [...acc, ...r.tags], [])',
        'rows: { tags: (string | undefined)[] }[]',
      ),
    ),
  ],
});

lowLib.tester.run('no-accumulating-spread array fixes without flatMap', rule, {
  valid: [],
  invalid: [
    {
      ...lowLib.typed(fn('rows.reduce((acc, r) => [...acc, ...r.tags], [])')),
      errors: ERR,
      output: null,
    },
    {
      ...lowLib.typed(fn('rows.reduce((acc, r) => [...acc, r.id], [])')),
      errors: ERR,
      output: `${header}${fn('rows.map((r) => r.id)')}`,
    },
  ],
});

typescriptRuleTester().run('no-accumulating-spread array fixes without types', rule, {
  valid: [],
  invalid: [{ code: 'rows.reduce((acc, r) => [...acc, r.id], []);', errors: ERR, output: null }],
});
