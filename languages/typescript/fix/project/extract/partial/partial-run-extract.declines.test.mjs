import { describe, expect, it } from 'vitest';
import { useFixtureProjects } from '../../test-support/fixture-project.mjs';
import { forcedPartialRecipe, spansOf } from '../test-support/forced.mjs';
import {
  headerCopy,
  headerPair,
  validationCopy,
  validationPair,
} from '../test-support/partial-sources.mjs';
import { partialRunExtractRecipe as recipe } from './partial-run-extract.mjs';

const projects = useFixtureProjects();

function outcome(source, use) {
  const result = projects.fix(
    { 'src/a.ts': source },
    { recipe: use, rule: 'structure/near-duplicate' },
  );
  return { source: result.tree['src/a.ts'], notes: result.notes };
}

function note(line, reason) {
  return [`--fix left src/a.ts:${line} near-duplicate: ${reason}`];
}

function forced(source, [first, last]) {
  return forcedPartialRecipe({ runs: spansOf(source, first, last) });
}

function longer(source) {
  const runs = spansOf(source, ...HEADER_RUN);
  runs[1].end += 1;
  return forcedPartialRecipe({ runs });
}

function pairWith(afterFirst, afterSecond, change = (text) => text) {
  return change(
    [
      headerCopy('headerNames', { after: afterFirst }),
      headerCopy('headerCount', { before: '  const total = raw.length;', after: afterSecond }),
    ].join('\n'),
  );
}

const HEADER_RUN = ['const headers', 'const names'];
const CHECK_RUN = ['if (name.length === 0)', 'const trimmed'];
const early = headerPair().replaceAll(
  "const index = line.indexOf(':');",
  "const index = line.indexOf(':');\n    if (line === '') {\n      return {};\n    }",
);
const two = pairWith(
  '  return names.join(",") + String(Object.keys(headers).length);',
  '  return names.length + total + Object.keys(headers).length;',
);
const exceptions = validationPair()
  .replace("throw new Error('name is too long')", "throw new RangeError('name is too long')")
  .replace("throw new Error('name is too long')", "throw new TypeError('name is too long')");
const writes = headerPair()
  .replaceAll('const headers', 'let seen = 0;\n  const headers')
  .replaceAll('const index =', 'seen += 1;\n    const index =');
const closure = pairWith(
  '  scale += 1;\n  return names.join(",");',
  '  scale += 1;\n  return names.length + total;',
  (text) =>
    text
      .replaceAll('const headers', 'let scale = 1;\n  const headers')
      .replaceAll('.sort();', '.sort().map((name) => name + String(scale));'),
);
const SEEN = 'let seen = 0;\n  const bump = () => {\n    seen += 1;\n  };';
const changing = [
  headerCopy('headerNames', { before: SEEN }),
  headerCopy('headerCount', {
    before: `${SEEN}\n  const total = raw.length;`,
    after: '  return names.length + total;',
  }),
]
  .join('\n')
  .replaceAll("const index = line.indexOf(':');", "const index = line.indexOf(':');\n    bump();")
  .replaceAll('< limit', '< limit + seen');
const escaping = headerPair()
  .replaceAll('limit: number)', 'limit: number, hooks: Array<() => void>)')
  .replaceAll(
    'const headers: Record<string, string> = {};',
    'const headers: Record<string, string> = {};\n  let count = 0;',
  )
  .replaceAll('const names', 'hooks.push(() => {\n    count += 1;\n  });\n  const names')
  .replaceAll('return names.join(",");', 'return names.join(",") + String(count);')
  .replaceAll('return names.length + total;', 'return names.length + total + count;');
const templated = headerPair().replaceAll('.trim();\n', '.trim() + `;\nend\n  tail`;\n');
const endingComment = headerPair().replace(
  /(function headerCount[^]*?\.trim\(\);)\n {4}\}/u,
  '$1\n      // keep: ticket 4711\n    }',
);
const declaring = headerPair().replaceAll(
  'const headers',
  'function pad(text: string) {\n    return text;\n  }\n  const headers',
);
const counted = headerPair();
const comment = headerPair().replace(
  /(function headerCount[^]*)const index/u,
  '$1// keep the order\n    const index',
);
const taken = `${headerPair()}\nexport const sharedHeaderNamesSteps = 1;\n`;
const awaiting = headerPair()
  .replaceAll(
    'const names = Object.keys(headers).sort();',
    'const names = await Promise.resolve(Object.keys(headers).sort());',
  )
  .replaceAll('export function', 'export async function');
const destructured = headerPair().replaceAll(
  'const names = Object.keys(headers).sort();',
  'const [names] = [Object.keys(headers).sort()];',
);
const unequal = pairWith('  return names.join(",");', '  return total;');
const methods = `export class Reader {\n  limit = 3;\n${headerPair()
  .replaceAll('export function ', '  ')
  .replaceAll('limit)', 'this.limit)')}}\n`;

const CASES = [
  [
    'an early return',
    early,
    forced(early, HEADER_RUN),
    note(1, 'the run returns early on some paths'),
  ],
  [
    'two values used after the run',
    two,
    forced(two, HEADER_RUN),
    note(1, 'the run defines more than one value that the code after it uses'),
  ],
  [
    'different exceptions',
    exceptions,
    forced(exceptions, CHECK_RUN),
    note(1, 'the copies throw different exceptions'),
  ],
  [
    'a write to an earlier variable',
    writes,
    forced(writes, HEADER_RUN),
    note(1, 'the run writes a variable declared before it'),
  ],
  [
    'a closure over a changing variable',
    closure,
    forced(closure, HEADER_RUN),
    note(1, 'a closure in the run reads a variable that changes outside it'),
  ],
  [
    'a call that changes a variable the run reads',
    changing,
    forced(changing, HEADER_RUN),
    note(1, 'a call in the run can change a variable that the run reads'),
  ],
  [
    'a closure over a variable the run declares',
    escaping,
    forced(escaping, HEADER_RUN),
    note(1, 'a closure in the run uses a variable that the run declares'),
  ],
  [
    'a template literal that spans lines',
    templated,
    forced(templated, HEADER_RUN),
    note(1, 'the code has a string or template literal that spans lines'),
  ],
  [
    'a comment before a closing brace',
    endingComment,
    forced(endingComment, HEADER_RUN),
    note(1, 'the second copy has comments the shared function would drop'),
  ],
  [
    'a var',
    headerPair().replaceAll('const headers', 'var headers'),
    undefined,
    note(1, 'the run declares a var'),
  ],
  [
    'a function declaration in the run',
    declaring,
    forced(declaring, ['function pad', 'const names']),
    note(1, 'the run declares a function, class or type, or has a statement of another kind'),
  ],
  [
    'runs of different lengths',
    counted,
    longer(counted),
    note(1, 'the runs have different numbers of statements'),
  ],
  [
    'a destructured value',
    destructured,
    recipe,
    note(1, 'the run defines a destructured value that the code after it uses'),
  ],
  ['different values', unequal, recipe, note(1, 'the runs produce different values')],
  ['an await', awaiting, recipe, note(1, 'the run awaits or yields')],
  ['this', methods, recipe, note(3, 'the code uses this, super, JSX, decorators or a generator')],
  [
    'a comment only the second copy has',
    comment,
    recipe,
    note(1, 'the second copy has comments the shared function would drop'),
  ],
  ['a name in the file', taken, recipe, note(1, 'the name of the shared function would collide')],
];

describe('partialRunExtractRecipe declines', () => {
  it.each(CASES)('leaves the source untouched for %s', (_name, source, use, notes) => {
    expect(outcome(source, use ?? recipe)).toEqual({ source, notes });
  });

  it('leaves copies in different files alone', () => {
    const files = {
      'src/a.ts': headerCopy('headerNames'),
      'src/b.ts': headerCopy('headerCount', {
        before: '  const total = raw.length;',
        after: '  return names.length + total;',
      }),
    };
    const result = projects.fix(files, { recipe, rule: 'structure/near-duplicate' });
    expect([result.tree['src/a.ts'], result.tree['src/b.ts'], result.notes]).toEqual([
      files['src/a.ts'],
      files['src/b.ts'],
      [],
    ]);
  });

  it('declines a run that starts inside a statement', () => {
    const source = validationCopy('first', { message: 'a', after: '  return trimmed;' });
    const text = `${source}\n${source.replace('first', 'second')}`;
    const runs = [
      { start: 2, end: 4 },
      { start: 2, end: 4 },
    ];
    expect(outcome(text, forcedPartialRecipe({ runs }))).toEqual({
      source: text,
      notes: note(1, 'a run is not a whole list of statements in a block'),
    });
  });
});
