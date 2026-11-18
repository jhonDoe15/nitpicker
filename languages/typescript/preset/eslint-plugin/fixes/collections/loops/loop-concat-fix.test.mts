import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/collections/no-accumulator-concat.mts';

const header = [
  'type Row = {',
  '  id: string;',
  '  n: number;',
  '  tags: string[];',
  '  one: string;',
  '  box: { a: number };',
  '  maybe?: string[];',
  '  mixed: string | string[];',
  '  anything: any;',
  '  bytes: Uint8Array;',
  '  holes: (string | undefined)[];',
  '  spreadable: { [Symbol.isConcatSpreadable]: boolean; length: number };',
  '};',
  'declare const history: unknown[][];',
  'declare function use(value: unknown): void;',
  'declare function pick<T>(value: T): T;',
  'declare function load(): Promise<string[]>;',
  '',
].join('\n');
type Errors = {
  messageId: string;
  suggestions?: { messageId: string; output: string }[];
}[];
const { tester, typed } = typedCaseProject<Errors>({ prefix: 'nitpicker-loop-concat-', header });

function wrap(body: string, parameters = 'xs: Row[], existing: string[]') {
  return `export async function f(${parameters}) {\n${body}\n}`;
}

function loopOf(statement: string, before = '', after = '  return out;') {
  return `${before}  let out: string[] = [];\n  for (const x of xs) {\n    ${statement}\n  }\n${after}`;
}

function constLoopOf(statement: string, before = '', after = '  return out;') {
  return loopOf(statement, before, after).replace('let out', 'const out');
}

function pushes(body: string, output: string, parameters?: string) {
  return {
    ...typed(wrap(body, parameters)),
    errors: [
      {
        messageId: 'loopConcat',
        suggestions: [
          { messageId: 'pushOntoArray', output: `${header}${wrap(output, parameters)}` },
        ],
      },
    ],
  };
}

function declines(body: string, parameters?: string) {
  return { ...typed(wrap(body, parameters)), errors: [{ messageId: 'loopConcat' }] };
}

tester.run('no-accumulator-concat loop suggestion', rule, {
  valid: [],
  invalid: [
    pushes(
      '  let rows: string[] = [];\n  let more = true;\n  do {\n    const page = await load();\n    rows = rows.concat(page);\n  } while (more);\n  return rows;',
      '  const rows: string[] = [];\n  let more = true;\n  do {\n    const page = await load();\n    for (const item of page) rows.push(item);\n  } while (more);\n  return rows;',
    ),
    pushes(
      '  let out: { json: unknown }[] = [];\n  for (const x of xs) {\n    out = out.concat({ json: { id: x.id } });\n  }\n  return out;',
      '  const out: { json: unknown }[] = [];\n  for (const x of xs) {\n    out.push({ json: { id: x.id } });\n  }\n  return out;',
    ),
    pushes(
      loopOf('out.push(x.id);\n    out = out.concat(x.tags);'),
      constLoopOf('out.push(x.id);\n    for (const item of x.tags) out.push(item);'),
    ),
    pushes(loopOf('out = out.concat([x.id, x.one]);'), constLoopOf('out.push(x.id, x.one);')),
    pushes(loopOf('out = out.concat(x.one);'), constLoopOf('out.push(x.one);')),
    pushes(loopOf("out = out.concat('-');"), constLoopOf("out.push('-');")),
    pushes(
      loopOf('out = out.concat(x.tags);'),
      constLoopOf('for (const item of x.tags) out.push(item);'),
    ),
    pushes(
      loopOf('out = out.concat(x.tags.filter(Boolean));'),
      constLoopOf('for (const item of x.tags.filter(Boolean)) out.push(item);'),
    ),
    pushes(
      loopOf('out = out.concat(pick(x.tags) ?? []);'),
      constLoopOf('for (const item of pick(x.tags) ?? []) out.push(item);'),
    ),
    pushes(
      loopOf('out = out.concat(x.tags);\n    use(item);', '  const item = 1;\n'),
      constLoopOf(
        'for (const item2 of x.tags) out.push(item2);\n    use(item);',
        '  const item = 1;\n',
      ),
    ),
    pushes(
      '  let out: { a: number }[] = [];\n  for (const x of xs) {\n    out = out.concat(x.box);\n  }\n  return out;',
      '  const out: { a: number }[] = [];\n  for (const x of xs) {\n    out.push(x.box);\n  }\n  return out;',
    ),
    pushes(
      '  let out: string[] = [];\n  for (const x of xs) out = out.concat(x.tags);\n  return out;',
      '  const out: string[] = [];\n  for (const x of xs) for (const item of x.tags) out.push(item);\n  return out;',
    ),
    pushes(
      '  let out: string[] = [];\n  let i = 0;\n  while (i < xs.length) {\n    out = out.concat(xs[i++].tags);\n  }\n  return out;',
      '  const out: string[] = [];\n  let i = 0;\n  while (i < xs.length) {\n    for (const item of xs[i++].tags) out.push(item);\n  }\n  return out;',
    ),
    pushes(
      loopOf('out = out.concat(String(out.length));'),
      constLoopOf('out.push(String(out.length));'),
    ),
    pushes(
      loopOf('out = out.concat(x.tags);', '', '  history.push(out);\n  return out;'),
      constLoopOf(
        'for (const item of x.tags) out.push(item);',
        '',
        '  history.push(out);\n  return out;',
      ),
    ),
    declines(
      '  let merged = existing;\n  for (const x of xs) {\n    merged = merged.concat(x.tags);\n  }\n  return merged;',
    ),
    declines(
      '  let merged = existing.slice();\n  for (const x of xs) {\n    merged = merged.concat(x.tags);\n  }\n  return merged;',
    ),
    declines(loopOf('out = out.concat(out);')),
    declines(loopOf('out = out.concat(out.slice(1));')),
    declines(loopOf('out.push(out);\n    out = out.concat(x.tags);')),
    declines(loopOf('out = out.concat(x.tags);\n    history.push(out);')),
    declines(loopOf('out = out.concat(x.tags);\n    use(out);')),
    declines(loopOf('out = out.concat(x.tags);\n    if (x.n) return out;')),
    declines(loopOf('out = out.concat(x.tags);\n    setTimeout(() => use(out), 0);')),
    declines(loopOf('out = out.concat(x.tags);\n    const alias = out;\n    use(alias);')),
    declines(loopOf('out = out.concat(x.tags);\n    out.sort();')),
    declines(loopOf('out = out.concat(x.tags);', '', '  const done = () => out;\n  return done;')),
    declines(
      loopOf('out = out.concat(x.tags);', '  const alias = existing;\n', '  return alias;').replace(
        'let out: string[] = []',
        'let out: string[] = existing',
      ),
    ),
    declines(loopOf('out = out.concat(x.tags);', '', '  out = [];\n  return out;')),
    declines(loopOf('out = out.concat(x.tags);\n    if (x.n) out = [];')),
    declines(loopOf('const next = (out = out.concat(x.tags));\n    use(next);')),
    declines(loopOf('if ((out = out.concat(x.tags)).length > 5) break;')),
    declines(loopOf('out = out.concat(x.tags, x.id);')),
    declines(loopOf('out = out.concat(...x.tags);')),
    declines(loopOf('out = out.concat();')),
    declines(loopOf('out = out.concat([]);')),
    declines(loopOf('out = out.concat([...x.tags, x.id]);')),
    declines(loopOf('out = out.concat(x.mixed);')),
    declines(loopOf('out = out.concat(x.anything);')),
    declines(loopOf('out = out.concat(x.maybe);')),
    declines(loopOf('out = out.concat(x.bytes);')),
    declines(loopOf('out = out.concat(x.spreadable);')),
    declines(loopOf('out = out.concat(x.holes);')),
    declines(
      loopOf('out = out.concat({ [Symbol.isConcatSpreadable]: true, length: 1, 0: x.id });'),
    ),
    declines(loopOf('out = out.concat({ [x.id]: 1 });')),
    declines(loopOf('out = out.concat({ ...x.box });')),
    declines(loopOf("out = out.concat({ a: 1, ['b']: 2 });")),
    declines(loopOf('out = out.concat(arguments);')),
    declines(loopOf('out = out.concat(x.tags /* why */);')),
    declines(
      '  let out: string[] = [];\n  xs.forEach((x) => {\n    out = out.concat(x.tags);\n  });\n  return out;',
    ),
    declines(
      '  let out: string[] = [];\n  for (const x of xs) {\n    out = out.concat(x.tags);\n  }\n  return () => out;',
    ),
    declines(
      '  let out: readonly string[] = [];\n  for (const x of xs) {\n    out = out.concat(x.tags);\n  }\n  return out;',
    ),
    declines(
      '  let out: string[] = [], other = 1;\n  for (const x of xs) {\n    out = out.concat(x.tags);\n  }\n  return [out, other];',
    ),
  ],
});

const plain = 'let out = [];\nfor (const x of xs) {\n  out = out.concat(x.tags);\n}';

typescriptRuleTester().run('no-accumulator-concat loop suggestion without types', rule, {
  valid: [],
  invalid: [
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = out.concat({ id: x.id });\n}',
      errors: [
        {
          messageId: 'loopConcat',
          suggestions: [
            {
              messageId: 'pushOntoArray',
              output: 'const out = [];\nfor (const x of xs) {\n  out.push({ id: x.id });\n}',
            },
          ],
        },
      ],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = out.concat([x.id, 1]);\n}',
      errors: [
        {
          messageId: 'loopConcat',
          suggestions: [
            {
              messageId: 'pushOntoArray',
              output: 'const out = [];\nfor (const x of xs) {\n  out.push(x.id, 1);\n}',
            },
          ],
        },
      ],
    },
    { code: plain, errors: [{ messageId: 'loopConcat' }] },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = out.concat({ [Symbol.isConcatSpreadable]: true, length: 1, 0: x.id });\n}',
      errors: [{ messageId: 'loopConcat' }],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = out.concat({ ...x });\n}',
      errors: [{ messageId: 'loopConcat' }],
    },
    {
      code: 'let out: string[] = [];\nfor (const x of xs) {\n  out = out.concat({ id: x.id });\n}',
      errors: [{ messageId: 'loopConcat' }],
    },
  ],
});
