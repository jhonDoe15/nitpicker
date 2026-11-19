import {
  suggestionCases,
  typedCaseProject,
} from '../../../test-support/projects/typed-ts-project.mts';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/collections/no-accumulating-spread.mts';

const header = [
  'type Row = { id: string; n: number; tags: string[] };',
  'declare const history: unknown[][];',
  'declare function use(value: unknown): void;',
  'declare function load(): Promise<string>;',
  '',
].join('\n');
type Errors = { messageId: string; suggestions?: { messageId: string; output: string }[] }[];
const { tester, typed } = typedCaseProject<Errors>({ prefix: 'nitpicker-loop-push-', header });

function wrap(body: string, parameters = 'xs: Row[], existing: string[]') {
  return `export function f(${parameters}) {\n${body}\n}`;
}

const { pushes, declines } = suggestionCases({
  typed,
  header,
  wrap,
  messageId: 'loopArray',
  suggestionId: 'pushOntoArray',
});

const loopOf = (statement: string, before = '', after = '  return out;') =>
  `${before}  let out: string[] = [];\n  for (const x of xs) {\n    ${statement}\n  }\n${after}`;
const constLoopOf = (statement: string, before = '', after = '  return out;') =>
  loopOf(statement, before, after).replace('let out', 'const out');

const AWAITED_PUSH =
  '  const out: string[] = [];\n  for (const x of xs) {\n    out.push(await load());\n  }\n  return out;';

function asAsync(body: string): string {
  return wrap(body).replace('function', 'async function');
}

tester.run('no-accumulating-spread loop suggestion', rule, {
  valid: [],
  invalid: [
    pushes(loopOf('out = [...out, x.id];'), constLoopOf('out.push(x.id);')),
    pushes(
      '  let out = [];\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
      '  const out = [];\n  for (const x of xs) {\n    out.push(x.id);\n  }\n  return out;',
    ),
    pushes(
      loopOf('out = [...out, x.id, String(x.n)];'),
      constLoopOf('out.push(x.id, String(x.n));'),
    ),
    pushes(
      loopOf('out = [...out, ...x.tags];'),
      constLoopOf('for (const item of x.tags) out.push(item);'),
    ),
    pushes(
      loopOf('out = [...out, ...x.tags];\n    use(item);', '  const item = 1;\n'),
      constLoopOf(
        'for (const item2 of x.tags) out.push(item2);\n    use(item);',
        '  const item = 1;\n',
      ),
    ),
    pushes(loopOf('out = [...out, (use(x), x.id)];'), constLoopOf('out.push((use(x), x.id));')),
    pushes(
      loopOf('if (x.n) out = [...out, x.id]; else out = [...out, "-"];'),
      constLoopOf('if (x.n) out.push(x.id); else out.push("-");'),
    ),
    pushes(
      loopOf('if (x.n) out = [...out, ...x.tags];'),
      constLoopOf('if (x.n) for (const item of x.tags) out.push(item);'),
    ),
    pushes(
      loopOf('out = [...out, String(out.length)];'),
      constLoopOf('out.push(String(out.length));'),
    ),
    pushes(
      loopOf('out = [...out, out[out.length - 1] ?? x.id];'),
      constLoopOf('out.push(out[out.length - 1] ?? x.id);'),
    ),
    pushes(
      loopOf('out = [...out, x.id];\n    out = [...out, x.id.toUpperCase()];'),
      constLoopOf('out.push(x.id);\n    out.push(x.id.toUpperCase());'),
    ),
    pushes(
      loopOf('out = [...out, x.id];', '', '  use(out);\n  return out.length;'),
      constLoopOf('out.push(x.id);', '', '  use(out);\n  return out.length;'),
    ),
    declines(loopOf('out = [...out, x.id];', '', '  const done = () => out;\n  return done;')),
    pushes(
      '  let out: string[] = [];\n  for (const x of xs) out = [...out, x.id];\n  return out;',
      '  const out: string[] = [];\n  for (const x of xs) out.push(x.id);\n  return out;',
    ),
    pushes(
      '  let out: string[] = [];\n  let i = 0;\n  while (i < xs.length) {\n    out = [...out, xs[i++].id];\n  }\n  return out;',
      '  const out: string[] = [];\n  let i = 0;\n  while (i < xs.length) {\n    out.push(xs[i++].id);\n  }\n  return out;',
    ),
    pushes(
      '  let out: string[] = [];\n  do {\n    out = [...out, "a"];\n  } while (out.length < 3);\n  return out;',
      '  const out: string[] = [];\n  do {\n    out.push("a");\n  } while (out.length < 3);\n  return out;',
    ),
    pushes(
      '  let out: string[] = [];\n  for (const x of xs) {\n    for (const tag of x.tags) {\n      out = [...out, tag];\n    }\n  }\n  return out;',
      '  const out: string[] = [];\n  for (const x of xs) {\n    for (const tag of x.tags) {\n      out.push(tag);\n    }\n  }\n  return out;',
    ),
    pushes(
      '  const groups: string[][] = [];\n  for (const x of xs) {\n    let out: string[] = [];\n    for (const tag of x.tags) {\n      out = [...out, tag];\n    }\n    groups.push(out);\n  }\n  return groups;',
      '  const groups: string[][] = [];\n  for (const x of xs) {\n    const out: string[] = [];\n    for (const tag of x.tags) {\n      out.push(tag);\n    }\n    groups.push(out);\n  }\n  return groups;',
    ),
    pushes(
      '  let out: string[] = [existing[0]];\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
      '  const out: string[] = [existing[0]];\n  for (const x of xs) {\n    out.push(x.id);\n  }\n  return out;',
    ),
    {
      ...typed(
        asAsync(
          '  let out: string[] = [];\n  for (const x of xs) {\n    out = [...out, await load()];\n  }\n  return out;',
        ),
      ),
      errors: [
        {
          messageId: 'loopArray',
          suggestions: [
            {
              messageId: 'pushOntoArray',
              output: `${header}${asAsync(AWAITED_PUSH)}`,
            },
          ],
        },
      ],
    },
    pushes(
      loopOf('out = [...out, x.id];', '', '  const alias = out;\n  use(alias);\n  return out;'),
      constLoopOf('out.push(x.id);', '', '  const alias = out;\n  use(alias);\n  return out;'),
    ),
    declines(
      '  let out: string[] = [];\n  const alias = out;\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return alias;',
    ),
    pushes(
      loopOf('out.push(x.id);\n    out = [...out, x.id.toUpperCase()];'),
      constLoopOf('out.push(x.id);\n    out.push(x.id.toUpperCase());'),
    ),
    declines(loopOf('out.push(out);\n    out = [...out, x.id];')),
    declines(loopOf('out = [...out, x.id];\n    history.push(out);')),
    declines(loopOf('out = [...out, x.id];\n    use(out);')),
    declines(loopOf('out = [...out, x.id];\n    if (x.n) return out;')),
    declines(loopOf('out = [...out, x.id];\n    out.reverse();')),
    declines(loopOf('out = [...out, x.id];\n    out.length = 0;')),
    declines(loopOf('out = [...out, x.id];\n    out[0] = x.id;')),
    declines(loopOf('out = [...out, x.id];\n    const copy = out.slice();\n    use(copy);')),
    declines(loopOf('out = [...out, x.id];\n    const alias = out;\n    use(alias);')),
    declines(loopOf('out = [...out, x.id];\n    setTimeout(() => use(out), 0);')),
    declines(
      loopOf('out = [...out, x.id];', '', '  const done = () => out;\n  use(done);\n  return 1;'),
    ),
    declines(loopOf('xs.forEach(() => {\n      out = [...out, x.id];\n    });')),
    declines(
      loopOf(
        'out = [...out, x.id];',
        '  function peek() {\n    return out;\n  }\n',
        '  return peek();',
      ),
    ),
    declines(loopOf('out = [...out, x.id];\n    if (x.n) out = [];')),
    declines(loopOf('out = [...out, x.id];\n    out = out.filter(Boolean);')),
    declines(loopOf('out = [...out, x.id];\n    out += "";')),
    declines(loopOf('out = [x.id, ...out];')),
    declines(loopOf('out = [...out];')),
    declines(loopOf('out = [...out, , x.id];')),
    declines(loopOf('out = [...out, x.id, ...x.tags];')),
    declines(loopOf('out = [...out, ...x.tags, x.id];')),
    declines(loopOf('out = [...out, ...x.id];')),
    declines(loopOf('out = [...out, ...new Set(x.tags)];')),
    declines(loopOf('out = [...out, ...x.tags.values()];')),
    declines(loopOf('out = [...out, ...out];')),
    declines(loopOf('out = [...out, ...out.slice(1)];')),
    declines(loopOf('const next = (out = [...out, x.id]);\n    use(next);')),
    declines(loopOf('out = [...out, x.id /* why */];')),
    declines(loopOf('out = [...out, x.id];', '', '  out = [];\n  return out;')),
    declines(
      loopOf(
        'out = [...out, x.id];\n  }\n  use(out);\n  for (const y of xs) {\n    out = [...out, y.id];',
      ),
    ),
    declines(loopOf('out = [...out, x.id];', '', '  out = [...out, "end"];\n  return out;')),
    declines(
      '  let out: string[] = existing;\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
    ),
    declines(
      '  let out: string[] = [].concat(existing as never);\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
    ),
    declines(
      '  let out: readonly string[] = [];\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
    ),
    declines(
      '  let out!: string[];\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return out;',
    ),
    declines(
      '  let out: string[] = [], other = 1;\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return [out, other];',
    ),
    pushes(
      '  let out: string[] = [];\n  for (const x of xs) {\n    out = [...out, x.id];\n  }\n  return { out };',
      '  const out: string[] = [];\n  for (const x of xs) {\n    out.push(x.id);\n  }\n  return { out };',
    ),
    declines(
      loopOf(
        'out = [...out, x.id];',
        '',
        '  return peek();\n  function peek() {\n    return out;\n  }',
      ),
    ),
  ],
});

const domainFile = '/repo/src/main/features/billing/domain/totals.ts';
const plain = 'let out = [];\nfor (const x of xs) {\n  out = [...out, x.id];\n}';
const plainFixed = 'const out = [];\nfor (const x of xs) {\n  out.push(x.id);\n}';

typescriptRuleTester().run('no-accumulating-spread loop suggestion without types', rule, {
  valid: [],
  invalid: [
    {
      code: plain,
      errors: [
        {
          messageId: 'loopArray',
          suggestions: [{ messageId: 'pushOntoArray', output: plainFixed }],
        },
      ],
    },
    { code: plain, filename: domainFile, errors: [{ messageId: 'domainLoopArray' }] },
    {
      code: 'let out: string[] = [];\nfor (const x of xs) {\n  out = [...out, x.id];\n}',
      errors: [{ messageId: 'loopArray' }],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = [...out, ...x.tags];\n}',
      errors: [{ messageId: 'loopArray' }],
    },
    {
      code: 'let out = {};\nfor (const x of xs) {\n  out = { ...out, [x.id]: 1 };\n}',
      errors: [{ messageId: 'loopObject' }],
    },
    {
      code: 'let out = [];\nfor (const x of xs) {\n  out = [...out, x.id];\n}\nexport { out };',
      errors: [{ messageId: 'loopArray' }],
    },
    {
      code: 'export let out = [];\nfor (const x of xs) {\n  out = [...out, x.id];\n}',
      errors: [{ messageId: 'loopArray' }],
    },
  ],
});
