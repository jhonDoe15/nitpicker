import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFiles } from './test-support/fixture-files.mjs';
import {
  commit,
  copyGitTemplate,
  createGitTemplate,
  fixtureGit,
} from './test-support/git-repository.mjs';
import { parseChangedLines, readChangedLines } from './patches/changed-lines.mjs';
import { baseLineOf, headLineOf } from './unchanged-lines.mjs';

const lines = (...text) => `${text.join('\n')}\n`;
const gitTemplate = createGitTemplate();
const roots = [];

function changesBetween(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unchanged-lines-'));
  roots.push(root);
  copyGitTemplate(gitTemplate, root);
  writeFiles(root, Object.fromEntries(Object.entries(files).map(([file, [base]]) => [file, base])));
  commit(root, 'base');
  const mergeBaseSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  writeFiles(
    root,
    Object.fromEntries(Object.entries(files).map(([file, [, head]]) => [file, head])),
  );
  commit(root, 'head');
  const headSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  return readChangedLines({
    repositoryRoot: root,
    mergeBaseSha,
    headSha,
    projectRelativePath: '.',
  });
}

function pick(file, names) {
  return Object.fromEntries(names.map((name) => [name, file[name]]));
}

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

const FORMATTED = {
  'greet.py': [
    lines('def greet(name):', "    print('hello ' + name)", "    print( 'bye ' + name )"),
    lines('def greet(name):', '    print("hello " + name)', '    print("bye " + name)'),
  ],
  'branches.py': [
    lines('def check(x):', "    if x == 1: print('v1')", '    return x'),
    lines('def check(x):', '    if x == 1:', '        print("v1")', '    return x'),
  ],
  'list.ts': [
    lines(
      'const total = sum(',
      '  first,',
      '  second,',
      ');',
      'export const twice = value => value * 2',
    ),
    lines('const total = sum(first, second)', 'export const twice = (value) =>', '  value * 2;'),
  ],
  'Main.java': [
    lines('class Main {', "  char c = 'a';", '}'),
    lines('class Main {', '  char c = "a";', '}'),
  ],
  'edit.py': [lines('def f(a, b):', '    run(a, b)'), lines('def f(a, b):', '    run(a)')],
  'mixed.py': [lines("x = 'a'", "y = 'b'", "z = 'c'"), lines('x = "a"', 'y = "b2"', 'z = "c"')],
};

describe('lines whose only change is formatting', () => {
  let changes;

  beforeAll(() => {
    changes = changesBetween(FORMATTED);
  });

  it('counts a quote and spacing restyle of a Python line as unchanged', () => {
    expect(pick(changes.get('greet.py'), ['ranges', 'inserted', 'carried'])).toEqual({
      ranges: [],
      inserted: [],
      carried: [
        [2, 2],
        [3, 3],
      ],
    });
  });

  it('counts a one-line if that ruff format splits in two as unchanged, both halves from its line', () => {
    expect(pick(changes.get('branches.py'), ['ranges', 'carried'])).toEqual({
      ranges: [],
      carried: [
        [2, 2],
        [3, 2],
      ],
    });
  });

  it('counts joined and split lines, trailing commas, semicolons and arrow parentheses as unchanged', () => {
    expect(changes.get('list.ts').ranges).toEqual([]);
  });

  it('keeps a changed quote style meaningful where the formatter never changes it', () => {
    expect(changes.get('Main.java').ranges).toEqual([[2, 2]]);
  });

  it('counts a line that lost part of its code as edited', () => {
    expect(changes.get('edit.py').ranges).toEqual([[2, 2]]);
  });

  it('counts a line with a new token as edited, next to reformatted lines in the same hunk', () => {
    expect(pick(changes.get('mixed.py'), ['ranges', 'carried'])).toEqual({
      ranges: [[2, 2]],
      carried: [
        [1, 1],
        [3, 3],
      ],
    });
  });
});

const SEMANTIC = {
  'dedent.py': [
    lines(
      'def f(flag):',
      '    if flag:',
      '        flag = False',
      '        print("only when flag")',
    ),
    lines('def f(flag):', '    if flag:', '        flag = False', '    print("only when flag")'),
  ],
  'tuple.py': [
    lines('def f(value):', '    print((value,))'),
    lines('def f(value):', '    print((value))'),
  ],
  'raw.py': [lines('def f():', String.raw`    print(r"\'")`), lines('def f():', `    print(r"'")`)],
  'joined.py': [
    lines('def f():', '    return', '    print("never")'),
    lines('def f():', '    return print("never")'),
  ],
  'launder.py': [
    lines('def old(items):', '    print("debug", items)', '', '', 'def keep():', '    return 1'),
    lines(
      'def keep():',
      '    return 1',
      '',
      '',
      'def brand_new(items):',
      '    print("debug", items)',
    ),
  ],
  'steps.ts': [
    lines('export const f = (a, b) => a + ++b;'),
    lines('export const f = (a, b) => a++ + b;'),
  ],
  'Gate.java': [
    lines('class Gate {', '  void f(boolean flag) {', '    if (flag); value = 2;', '  }', '}'),
    lines('class Gate {', '  void f(boolean flag) {', '    if (flag) value = 2;', '  }', '}'),
  ],
};

describe('edits a formatter never makes', () => {
  let changes;

  beforeAll(() => {
    changes = changesBetween(SEMANTIC);
  });

  it.each([
    ['dedent.py', 4],
    ['tuple.py', 2],
    ['raw.py', 2],
    ['joined.py', 2],
    ['steps.ts', 1],
    ['Gate.java', 3],
  ])('counts the edited line of %s as edited', (file, line) => {
    expect(changes.get(file).ranges).toContainEqual([line, line]);
  });

  it('does not let a deleted legacy line pass an identical line in new code elsewhere as unchanged', () => {
    const file = changes.get('launder.py');

    expect(file.ranges).toContainEqual([5, 6]);
    expect(baseLineOf(file, 6)).toBeUndefined();
  });
});

describe('files the alignment leaves to the line diff', () => {
  let changes;
  const statements = Array.from(
    { length: 30_000 },
    (_, index) => `a${String(index)}=b(${String(index)});`,
  );

  beforeAll(() => {
    changes = changesBetween({
      'web/app.min.js': [
        `var v="1.0.0";${statements.join('')}\n`,
        `var v="1.0.1";${statements.join('')}\n`,
      ],
      'data.json': [lines('[1, 2]'), lines('[1,2]')],
      'big.py': [
        lines(...Array.from({ length: 700 }, (_, index) => `a${String(index)} = 1`)),
        lines(...Array.from({ length: 700 }, (_, index) => `b${String(index)} = 2`)),
      ],
    });
  });

  it('aligns a long single-line file without overflowing the stack', () => {
    expect(changes.get('web/app.min.js').ranges).toEqual([[1, 1]]);
  });

  it('counts every line of a file it does not analyze as changed', () => {
    expect(changes.get('data.json').ranges).toEqual([[1, 1]]);
  });

  it('falls back to every added line when a hunk differs too much to align', () => {
    expect(pick(changes.get('big.py'), ['ranges', 'carried'])).toEqual({
      ranges: [[1, 700]],
      carried: [],
    });
  });

  it('counts every line as changed when the sources are not at hand', () => {
    const diff = [
      'diff --git a/x.py b/x.py',
      '--- a/x.py',
      '+++ b/x.py',
      '@@ -1 +1 @@',
      "-x = 'a'",
      '+x = "a"',
    ];

    expect(parseChangedLines(diff.join('\n')).get('x.py').ranges).toEqual([[1, 1]]);
  });
});

describe('lines that moved within a file', () => {
  let changes;

  beforeAll(() => {
    const sum = [
      '  let total = 0;',
      '  for (const item of items) total += item;',
      '  return total;',
    ];
    changes = changesBetween({
      'load.ts': [
        lines('function load(items) {', "  console.log('start');", ...sum, '}'),
        lines(
          ...['function sum(items) {', ...sum, '}', ''],
          ...['function load(items) {', '  console.log("start");', '  return sum(items);', '}'],
        ),
      ],
    });
  });

  it('keeps the first lines of a function unchanged when a block of it moves to a helper above it', () => {
    const { ranges } = changes.get('load.ts');
    const isChanged = (line) => ranges.some(([start, end]) => start <= line && line <= end);

    expect([1, 7, 8, 9].map(isChanged)).toEqual([true, false, false, true]);
  });

  it('maps a head line to its base line, around hunks and through carried lines', () => {
    const file = {
      hunks: [
        [1, 2, 1, 1],
        [5, 0, 5, 6],
      ],
      carried: [
        [8, 1],
        [9, 2],
      ],
    };

    expect([2, 3, 4, 9, 10, 11].map((line) => baseLineOf(file, line))).toEqual([
      3,
      4,
      5,
      2,
      undefined,
      6,
    ]);
    expect([1, 3, 6].map((line) => headLineOf(file, line))).toEqual([8, 2, 11]);
  });

  it('maps lines one to one in a file the change left alone', () => {
    expect(baseLineOf(undefined, 7)).toBe(7);
    expect(headLineOf(undefined, 7)).toBe(7);
  });
});
