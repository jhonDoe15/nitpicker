import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forbiddenMethodsOf,
  listEntriesOf,
  MERGED_LISTS,
  mergeForbiddenMethods,
  writeDetektLists,
} from './detekt-lists.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const NITPICKER = forbiddenMethodsOf(
  readFileSync(path.resolve(import.meta.dirname, '../../../detekt/nitpicker-detekt.yml'), 'utf8'),
);

function written(config) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-detekt-lists-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'config'));
  writeFileSync(path.join(root, 'config/detekt.yml'), config);
  const target = writeDetektLists(root, path.join(root, 'config/detekt.yml'));
  return {
    target,
    root,
    methods: target === undefined ? undefined : forbiddenMethodsOf(readFileSync(target, 'utf8')),
  };
}

describe('the preset list', () => {
  it('holds the calls of the one-way rules, the console prints among them, each with its reason', () => {
    expect(NITPICKER.map(({ value }) => value).slice(0, 6)).toEqual([
      'kotlin.run',
      'kotlin.with',
      'kotlin.also',
      'kotlinx.coroutines.runBlocking',
      'kotlin.io.print',
      'kotlin.io.println',
    ]);
    expect(NITPICKER.every(({ reason }) => typeof reason === 'string')).toBe(true);
  });
});

describe('mergeForbiddenMethods', () => {
  it('puts the preset entries first and appends the project ones in order', () => {
    const preset = [{ value: 'a', reason: 'A.' }];
    const project = [{ value: 'c' }, { value: 'b', reason: 'B.' }];

    expect(mergeForbiddenMethods(preset, project)).toEqual({
      merged: [{ value: 'a', reason: 'A.' }, { value: 'c' }, { value: 'b', reason: 'B.' }],
      added: 2,
    });
  });

  it('keeps the preset entry and its reason when the project lists the same call', () => {
    const preset = [{ value: 'a', reason: 'A.' }];

    expect(mergeForbiddenMethods(preset, [{ value: 'a', reason: 'Mine.' }])).toEqual({
      merged: preset,
      added: 0,
    });
  });

  it('lists a call the project repeats once, with its first reason', () => {
    expect(
      mergeForbiddenMethods(
        [],
        [
          { value: 'b', reason: 'First.' },
          { value: 'b', reason: 'Second.' },
        ],
      ),
    ).toEqual({ merged: [{ value: 'b', reason: 'First.' }], added: 1 });
  });
});

describe('forbiddenMethodsOf', () => {
  it('reads strings and value entries with an optional reason, and drops anything else', () => {
    const config = `style:
  ForbiddenMethodCall:
    methods:
      - 'kotlin.io.println'
      - value: 'java.lang.Thread.sleep'
        reason: 'Use a clock.'
      - value: 'java.lang.System.exit'
      - value: 5
      - reason: 'no value'
      - ''
      - null
      - [nested]
`;

    expect(forbiddenMethodsOf(config)).toEqual([
      { value: 'kotlin.io.println' },
      { value: 'java.lang.Thread.sleep', reason: 'Use a clock.' },
      { value: 'java.lang.System.exit' },
    ]);
  });

  it('keeps a method name with a balanced parameter list and drops a signature detekt cannot parse', () => {
    const config = `style:
  ForbiddenMethodCall:
    methods:
      - 'java.lang.Thread.sleep(long)'
      - 'kotlin.io.println(kotlin.Any?)'
      - 'foo(bar,)'
      - 'foo('
      - 'a.b(x'
      - 'a.b)x('
      - 'a.b(c)d'
      - 'kotlin.io.println(kotlin.Any?) '
      - ' kotlin.io.println'
      - 'two words'
      - value: 'a.b.c('
        reason: 'broken'
`;

    expect(forbiddenMethodsOf(config)).toEqual([
      { value: 'java.lang.Thread.sleep(long)' },
      { value: 'kotlin.io.println(kotlin.Any?)' },
      { value: 'foo(bar,)' },
    ]);
  });

  it.each([
    ['an empty file', ''],
    ['a file that is not a mapping', '- a\n- b\n'],
    ['a style ruleset that is not a mapping', 'style: 3\n'],
    ['a rule that is not a mapping', 'style:\n  ForbiddenMethodCall: true\n'],
    [
      'a methods key that is not a list',
      'style:\n  ForbiddenMethodCall:\n    methods: kotlin.run\n',
    ],
    ['YAML that does not parse', 'style: [unclosed\n  ForbiddenMethodCall: {'],
    ['a duplicate key', 'style:\n  a: 1\n  a: 2\n'],
  ])('finds nothing in %s', (_name, text) => {
    expect(forbiddenMethodsOf(text)).toEqual([]);
  });
});

describe('writeDetektLists', () => {
  it('writes the preset entries and the project ones, the preset ones first', () => {
    const { target, root, methods } = written(`style:
  ForbiddenMethodCall:
    active: false
    excludes: ['**/*.kt']
    methods:
      - 'kotlin.io.println'
      - 'java.lang.System.exit'
      - value: 'kotlin.run'
        reason: 'The project allows run.'
`);

    expect(target).toBe(path.join(root, 'build/nitpicker/detekt-lists.yml'));
    expect(methods).toEqual([...NITPICKER, { value: 'java.lang.System.exit' }]);
  });

  it('carries only the list, so the pins of the preset stay in force', () => {
    const { target } = written(
      "style:\n  ForbiddenMethodCall:\n    active: false\n    severity: info\n    methods: ['a.b']\n",
    );

    expect(readFileSync(target, 'utf8').split('\n').slice(0, 3)).toEqual([
      'style:',
      '  ForbiddenMethodCall:',
      '    methods:',
    ]);
    expect(readFileSync(target, 'utf8')).not.toMatch(/active|severity|excludes/);
  });

  it('writes nothing when the project lists no call of its own', () => {
    expect(written('style:\n  MagicNumber:\n    active: false\n').target).toBeUndefined();
    expect(
      written("style:\n  ForbiddenMethodCall:\n    methods: ['kotlin.run']\n").target,
    ).toBeUndefined();
  });

  it('survives hostile content: aliases, odd types and a list that is not a list', () => {
    const { methods } = written(`x: &b [1]
y: &a [*b]
style:
  ForbiddenMethodCall:
    methods:
      - &s 'a.b'
      - *s
      - {value: [x]}
`);

    expect(methods).toEqual([...NITPICKER, { value: 'a.b' }]);
    expect(written('style:\n  ForbiddenMethodCall:\n    methods: {a: 1}\n').target).toBeUndefined();
  });

  it('reads a project file built as an alias bomb as listing nothing', () => {
    const levels = Array.from(
      { length: 12 },
      (_, index) =>
        `l${String(index)}: &l${String(index)} [${Array(9)
          .fill(index === 0 ? '"x"' : `*l${String(index - 1)}`)
          .join(',')}]`,
    );
    const bomb = `${levels.join('\n')}\nstyle:\n  ForbiddenMethodCall:\n    methods: *l11\n`;

    expect(written(bomb).target).toBeUndefined();
  });

  it('keeps a reason that needs quoting in YAML', () => {
    const { methods } = written(
      `style:\n  ForbiddenMethodCall:\n    methods:\n      - value: 'a.b'\n        reason: "Use: 'x'\\n# not a comment"\n`,
    );

    expect(methods.at(-1)).toEqual({ value: 'a.b', reason: "Use: 'x'\n# not a comment" });
  });

  it('merges the project entries of every list detekt replaces instead of merging', () => {
    const { target } = written(`style:
  ForbiddenImport:
    imports:
      - value: 'org.legacy.Client'
        reason: 'Use the new client.'
  ForbiddenComment:
    comments: ['STOPSHIP']
  UseDataClass:
    excludeAnnotatedClasses: ['Projection', 7]
`);
    const text = readFileSync(target, 'utf8');
    const [, imports, comments, annotated] = MERGED_LISTS;

    expect(forbiddenMethodsOf(text)).toEqual([]);
    expect(listEntriesOf(text, imports).at(-1)).toEqual({
      value: 'org.legacy.Client',
      reason: 'Use the new client.',
    });
    expect(listEntriesOf(text, imports).length).toBeGreaterThan(1);
    expect(
      listEntriesOf(text, comments)
        .map(({ value }) => value)
        .at(-1),
    ).toBe('STOPSHIP');
    expect(listEntriesOf(text, annotated).map(({ value }) => value)).toEqual([
      'Entity',
      'Embeddable',
      'MappedSuperclass',
      'Document',
      'Table',
      'Node',
      'Projection',
    ]);
  });
});
