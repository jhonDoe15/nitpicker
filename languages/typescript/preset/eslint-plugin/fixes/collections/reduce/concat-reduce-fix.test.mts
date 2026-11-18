import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/collections/no-accumulator-concat.mts';

const header = [
  'type Row = {',
  '  id: string;',
  '  n: number;',
  '  tags: string[];',
  '  one: string;',
  '  maybe?: string[];',
  '  anything: any;',
  '  mixed: string | string[];',
  '  frozen: readonly string[];',
  '  bytes: Uint8Array;',
  '  holes: (string | undefined)[];',
  '  spreadable: { [Symbol.isConcatSpreadable]: boolean; length: number };',
  '  box: { a: number };',
  '  either: string[] | number[];',
  '};',
  'declare const all: string[];',
  'declare function pick<T>(value: T): T;',
  '',
].join('\n');
type Errors = { messageId: string }[];
const { tester, typed } = typedCaseProject<Errors>({
  prefix: 'nitpicker-concat-reduce-',
  lib: ['ES2022'],
  header,
});
const lowLib = typedCaseProject<Errors>({
  prefix: 'nitpicker-concat-reduce-low-',
  lib: ['ES2018'],
  header,
});
const ERR = [{ messageId: 'concat' }];

function fn(body: string, parameters = 'rows: Row[]') {
  return `export const a = (${parameters}) => ${body};`;
}

function fixes(code: string, output: string) {
  return { ...typed(code), errors: ERR, output: `${header}${output}` };
}

function declines(code: string) {
  return { ...typed(code), errors: ERR, output: null };
}

tester.run('no-accumulator-concat reduce fixes', rule, {
  valid: [],
  invalid: [
    fixes(fn('rows.reduce((acc, r) => acc.concat(r.tags), [])'), fn('rows.flatMap((r) => r.tags)')),
    fixes(fn('rows.reduce((acc, r) => acc.concat(r.one), [])'), fn('rows.flatMap((r) => r.one)')),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat(r.frozen), [])'),
      fn('rows.flatMap((r) => r.frozen)'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat(r.maybe ?? []), [])'),
      fn('rows.flatMap((r) => r.maybe ?? [])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat({ id: r.id }), [])'),
      fn('rows.flatMap((r) => ({ id: r.id }))'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat([r.id, r.one]), [])'),
      fn('rows.flatMap((r) => [r.id, r.one])'),
    ),
    fixes(fn('rows.reduce((acc, r) => acc.concat(r.n), [])'), fn('rows.flatMap((r) => r.n)')),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat(r.tags[0]), [])'),
      fn('rows.flatMap((r) => r.tags[0])'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat((r.n, r.tags)), [])'),
      fn('rows.flatMap((r) => (r.n, r.tags))'),
    ),
    fixes(
      fn('rows.reduce((acc, r, i) => acc.concat(r.tags.map((t) => t + i)), [])'),
      fn('rows.flatMap((r, i) => r.tags.map((t) => t + i))'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => {\n  return acc.concat(r.tags);\n}, [])'),
      fn('rows.flatMap((r) => {\n  return r.tags;\n})'),
    ),
    fixes(
      fn('rows.reduce(function (acc, r) { return acc.concat(r.tags); }, [])'),
      fn('rows.flatMap(function (r) { return r.tags; })'),
    ),
    fixes(
      fn('rows\n  .filter((r) => r.n)\n  .reduce((acc, { tags }) => acc.concat(tags), [])'),
      fn('rows\n  .filter((r) => r.n)\n  .flatMap(({ tags }) => tags)'),
    ),
    fixes(
      fn('(rows ?? []).reduce((acc, r) => acc.concat(r.tags), [])'),
      fn('(rows ?? []).flatMap((r) => r.tags)'),
    ),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat(r.tags), []).length'),
      fn('rows.flatMap((r) => r.tags).length'),
    ),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.tags), all)')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.mixed), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.either), [])')),
    declines(fn("rows.reduce((acc, r) => acc.concat(r.tags), ['x'])")),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.tags), [] as string[])')),
    declines(fn('rows.reduce<string[]>((acc, r) => acc.concat(r.tags), [])')),
    declines(fn('rows.reduce((acc: string[], r) => acc.concat(r.tags), [])')),
    declines(fn('rows.reduceRight((acc, r) => acc.concat(r.tags), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.tags, r.one), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(...r.tags), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.anything), [])')),
    fixes(
      fn('rows.reduce((acc, r) => acc.concat(pick(r.tags)), [])'),
      fn('rows.flatMap((r) => pick(r.tags))'),
    ),
    declines(
      'export function g<T>(rows: Row[], v: T) {\n  return rows.reduce((acc, r) => acc.concat(v), []);\n}',
    ),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.bytes), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.spreadable), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.holes), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.box as object), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(acc.length ? r.tags : r.one), [])')),
    declines(
      fn('rows.reduce((acc, r) => { if (!r.n) return acc; return acc.concat(r.tags); }, [])'),
    ),
    declines(fn('rows.reduce((acc, r) => (r.n ? acc.concat(r.tags) : acc), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.tags).slice(0, 5), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r.tags /* why */), [])')),
    declines(fn('rows?.reduce((acc, r) => acc.concat(r.tags), [])')),
    declines(fn('rows.reduce((acc, r) => acc.concat(r!.tags), [])', 'rows: (Row | undefined)[]')),
    declines(fn('rows.reduce(function (acc, r) { return acc.concat(arguments.length); }, [])')),
  ],
});

lowLib.tester.run('no-accumulator-concat reduce fixes without flatMap', rule, {
  valid: [],
  invalid: [
    {
      ...lowLib.typed(fn('rows.reduce((acc, r) => acc.concat(r.tags), [])')),
      errors: ERR,
      output: null,
    },
  ],
});

typescriptRuleTester().run('no-accumulator-concat reduce fixes without types', rule, {
  valid: [],
  invalid: [
    { code: 'rows.reduce((acc, r) => acc.concat(r.tags), []);', errors: ERR, output: null },
  ],
});
