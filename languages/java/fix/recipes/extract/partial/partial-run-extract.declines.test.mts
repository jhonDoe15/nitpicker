import { describe, expect, it } from 'vitest';
import { forcedPartial as untypedForcedPartial } from '../../../../adapters/near-duplicates/test-support/forced-partial.mjs';
import {
  headerMethod,
  headerPair,
  partialClassOf,
  validationMethod,
  validationPair,
} from '../test-support/partial-sources.mts';
import { javaExtractPartialRunRecipe as recipe } from './partial-run-extract.mts';

type Span = { readonly start: number; readonly end: number };
type Forced = { readonly methods: readonly string[]; readonly runs: readonly Span[] };

const forcedPartial: (text: string, options: Forced) => Promise<unknown> = untypedForcedPartial;
const PATH = 'src/main/java/demo/Align.java';
const NAMES = ['headerNames', 'headerCount'];

function planned(text: string, path = PATH) {
  return recipe.plan({ files: [{ path, text }], projectRoot: '/nonexistent' });
}

function note(line: number, reason: string): string[] {
  return [`--fix left ${PATH}:${String(line)} near-duplicate: ${reason}`];
}

function spans(text: string, [first, last]: readonly [string, string]): Span[] {
  const lines = text.split('\n');
  const rows = (needle: string) =>
    lines.flatMap((line, index) => (line.includes(needle) ? [index + 1] : []));
  const [starts, ends] = [rows(first), rows(last)];
  return [
    { start: starts.at(0) ?? 0, end: ends.at(0) ?? 0 },
    { start: starts.at(-1) ?? 0, end: ends.at(-1) ?? 0 },
  ];
}

const HEADER_RUN: readonly [string, string] = ['Map<String, String> headers', 'List<String> names'];
const [TOP, BOTTOM] = headerPair();
const returning = headerPair().map((method) =>
  method.replace(
    'int index',
    'if (line.isEmpty()) {\n                return null;\n            }\n            int index',
  ),
);
const both = [
  headerMethod('String', 'headerNames', {
    after: '        return String.join(",", names) + headers.size();',
  }),
  headerMethod('int', 'headerCount', {
    before: '        int total = raw.size();',
    after: '        return names.size() + total + headers.size();',
  }),
];
const writing = headerPair().map((method) =>
  method
    .replace('Map<String', 'int seen = 0;\n        Map<String')
    .replace('int index', 'seen++;\n            int index'),
);
const exceptions = validationPair().map((method, index) =>
  index === 0
    ? method
    : method
        .replace('"name is too long"', '"x"')
        .replace('IllegalArgumentException("x")', 'IllegalStateException("x")'),
);

const AMBIGUOUS =
  'the code may use instance state of the class, which the shared function cannot tell';
const inheriting = `${partialClassOf(
  ...headerPair().map((method) => method.replace('< limit', '< limit + LIMIT')),
).replace(
  'class Align {',
  'class Align extends Base {',
)}\nclass Base {\n    protected int LIMIT = 3;\n}\n`;
const constant = validationPair().map((method) =>
  method.replace(
    /throw new IllegalArgumentException\(("[^"]*")\);/u,
    'final String text = $1;\n            throw new IllegalArgumentException(text);',
  ),
);

const NATURAL: [string, string, string[]][] = [
  ['a field the class may inherit', inheriting, note(9, AMBIGUOUS)],
  [
    'a final local that differs',
    partialClassOf(...constant),
    note(24, 'the copies differ in code that is not a plain value'),
  ],
  [
    'a comment between statements of the run',
    partialClassOf(
      TOP,
      BOTTOM.replace('List<String> names', '// keep the order\n        List<String> names'),
    ),
    note(9, 'the second copy has comments the shared method would drop'),
  ],
  [
    'different classes',
    `${partialClassOf(TOP)}\nclass Other {\n${BOTTOM}}\n`,
    note(23, 'the copies are not in one class'),
  ],
  [
    'a name in the file',
    partialClassOf(...headerPair(), '    int sharedHeaderNamesSteps = 1;\n'),
    note(9, 'the name of the shared method would collide'),
  ],
  [
    'different exceptions',
    partialClassOf(TOP, BOTTOM.replace('int limit) {', 'int limit) throws java.io.IOException {')),
    note(9, 'the copies declare different exceptions'),
  ],
  [
    'one static copy',
    partialClassOf(TOP, BOTTOM.replace('    int headerCount', '    static int headerCount')),
    note(9, 'only one copy is static'),
  ],
  [
    'a comment only the second copy has',
    partialClassOf(TOP, BOTTOM.replace('int index', '// keep the order\n            int index')),
    note(9, 'the second copy has comments the shared method would drop'),
  ],
  [
    'an output declared with var',
    partialClassOf(
      ...headerPair().map((method) => method.replace('List<String> names', 'var names')),
    ),
    note(9, 'the value that the code after the run uses has a type the shared method cannot name'),
  ],
];

const FORCED: [string, string, string][] = [
  ['an early return', partialClassOf(...returning), 'the run returns early on some paths'],
  [
    'two values used after the run',
    partialClassOf(...both),
    'the run defines more than one value that the code after it uses',
  ],
  [
    'a write to an earlier variable',
    partialClassOf(...writing),
    'the run writes a variable declared before it',
  ],
];

describe('javaExtractPartialRunRecipe declines', () => {
  it.each(NATURAL)('leaves the source untouched for %s', (_name, text, notes) => {
    expect(planned(text)).toEqual({ fixes: [], notes });
  });

  it.each(FORCED)('declines %s', async (_name, text, reason) => {
    expect(await forcedPartial(text, { methods: NAMES, runs: spans(text, HEADER_RUN) })).toEqual({
      declined: reason,
    });
  });

  it('declines runs that throw different exception types', async () => {
    const text = partialClassOf(...exceptions);
    const runs = spans(text, ['if (name.isEmpty())', 'String trimmed']);
    expect(await forcedPartial(text, { methods: ['createUser', 'renameUser'], runs })).toEqual({
      declined: 'the copies throw different exceptions',
    });
  });

  it('declines a run that ends by throwing', async () => {
    const methods = ['first', 'second'].map((name) =>
      validationMethod('int', name, {
        message: `${name} needs a name`,
        trimmed: 'unbound',
        after: '        throw new IllegalStateException("unreachable");',
      }),
    );
    const text = partialClassOf(...methods);
    const runs = spans(text, ['if (name.isEmpty())', 'unreachable']);
    expect(await forcedPartial(text, { methods: ['first', 'second'], runs })).toEqual({
      declined: 'the run may end by throwing, so the method could lack a return after the call',
    });
  });

  it('skips files outside the main source set', () => {
    expect(planned(partialClassOf(...headerPair()), 'src/test/java/demo/Align.java')).toEqual({
      fixes: [],
      notes: [],
    });
  });
});
