import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changeRepositories, lines, pick } from './test-support/projects/changes-between.mjs';
import { parseChangedLines } from './patches/changed-lines.mjs';
import { lineMapOf } from './unchanged-lines.mjs';

const repositories = changeRepositories();

afterAll(() => {
  repositories.remove();
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
  'fee.go': [
    lines('package shop', 'func Fee(w int) int { if(w>10){ return 5 }; return 1 }'),
    lines(
      'package shop',
      'func Fee(w int) int {',
      '\tif w > 10 {',
      '\t\treturn 5',
      '\t}',
      '\treturn 1',
      '}',
    ),
  ],
};

describe('lines whose only change is formatting', () => {
  let changes;

  beforeAll(() => {
    changes = repositories.changesBetween(FORMATTED);
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

  it('counts a line gofmt only split, re-spaced and stripped of header parentheses as unchanged', () => {
    expect(pick(changes.get('fee.go'), ['ranges', 'inserted'])).toEqual({
      ranges: [],
      inserted: [],
    });
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
  'append.ts': [
    lines('function f() {', '  a();', '}'),
    lines('function f() {', '  a();', '  b();', '}'),
  ],
  'Append.kt': [lines('fun f() {', '    a()', '}'), lines('fun f() {', '    a()', '    b()', '}')],
  'append.go': [lines('func f() {', '\ta()', '}'), lines('func f() {', '\ta()', '\tb()', '}')],
  'twice.go': [
    lines('func first() {', '\tclean()', '}', '', 'func second() {', '\tclean()', '}'),
    lines(
      ...['func first() {', '\tclean()', '}', '', 'func middle() {', '\tclean()', '}', ''],
      ...['func second() {', '\tclean()', '}'],
    ),
  ],
  'Gate.java': [
    lines('class Gate {', '  void f(boolean flag) {', '    if (flag); value = 2;', '  }', '}'),
    lines('class Gate {', '  void f(boolean flag) {', '    if (flag) value = 2;', '  }', '}'),
  ],
};

describe('edits a formatter never makes', () => {
  let changes;

  beforeAll(() => {
    changes = repositories.changesBetween(SEMANTIC);
  });

  it.each([
    ['dedent.py', 4],
    ['tuple.py', 2],
    ['raw.py', 2],
    ['joined.py', 2],
    ['steps.ts', 1],
    ['Gate.java', 3],
    ['append.ts', 3],
    ['Append.kt', 3],
    ['append.go', 3],
  ])('counts the edited line of %s as edited', (file, line) => {
    expect(changes.get(file).ranges).toEqual([[line, line]]);
  });

  it('maps the legacy line of a repeated Go body to its own function, not to an inserted twin', () => {
    const map = lineMapOf(changes.get('twice.go'));

    expect([map.baseLineOf(6), map.baseLineOf(10)]).toEqual([undefined, 6]);
  });

  it('does not let a deleted legacy line pass an identical line in new code elsewhere as unchanged', () => {
    const file = changes.get('launder.py');

    expect(file.ranges).toEqual([[5, 6]]);
    expect(lineMapOf(file).baseLineOf(6)).toBeUndefined();
  });
});

describe('files the alignment leaves to the line diff', () => {
  let changes;
  const statements = Array.from(
    { length: 30_000 },
    (_, index) => `a${String(index)}=b(${String(index)});`,
  );

  beforeAll(() => {
    changes = repositories.changesBetween({
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
