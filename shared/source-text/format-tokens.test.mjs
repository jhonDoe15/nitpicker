import { describe, expect, it } from 'vitest';
import {
  formatAgnosticText,
  formatAgnosticTokens,
  sourceLanguage,
  sourceLines,
} from './format-tokens.mjs';

const lines = (...text) => `${text.join('\n')}\n`;

function tokensOf(filePath, text) {
  return formatAgnosticTokens(text, sourceLanguage(filePath)).map((token) => token.text);
}

describe('source text without what a formatter rewrites', () => {
  it.each([
    ['a.py', "print('hello ' + name)", 'print( "hello " + name )'],
    ['a.py', lines('if x == 1: print("v1")'), lines('if x == 1:', '    print("v1")')],
    ['a.py', lines('foo(a, b)'), lines('foo(', '    a,', '    b,', ')')],
    ['a.py', lines('x = [1, 2,]', 'd = {1: 2,}'), lines('x = [1, 2]', 'd = {1: 2}')],
    [
      'a.py',
      lines('def f():', '  if x:', '    return 1'),
      lines('def f():', '    if x:', '        return 1'),
    ],
    ['a.py', lines('x = 1;', 'a; b'), lines('x = 1', 'a', 'b')],
    ['a.py', lines('x = 1 #note'), lines('x = 1  # note')],
    ['a.py', lines("s = U'it\\'s'"), lines('s = "it\'s"')],
    ['a.py', lines('x = 1 + \\', '    2'), lines('x = 1 + 2')],
    ['a.ts', 'items.map(item => log(item,));', 'items.map((item) => log(item))'],
    ['a.ts', lines('a = b', "c = 'd'"), lines('a = b;', 'c = "d";')],
    ['a.ts', lines('a = b;', '(c)'), lines('a = b', ';(c)')],
    ['a.ts', lines('f(', '  a,', '  b,', ');'), lines('f(a, b)')],
    ['a.ts', lines('if (x)', '  foo()'), lines('if (x) foo();')],
    ['a.ts', lines('x = { a: 1, }; y = 1.50 + .5'), lines('x = {a:1}', 'y = 1.5 + 0.5')],
    ['a.ts', lines('function f() { return a }'), lines('function f() {', '  return a;', '}')],
    ['A.java', 'if(x==3){', 'if (x == 3) {'],
    ['A.java', lines('int[] a = {1, 2,};'), lines('int[] a = {1, 2};')],
    ['A.java', lines('/** One', ' * two three */'), lines('/**', ' * One two', ' * three', ' */')],
    ['A.kt', lines('listOf(a, b,);', 'val x = 1;'), lines('listOf(a, b)', 'val x = 1')],
    ['A.kt', lines('foo().bar() ?: baz'), lines('foo()', '    .bar()', '    ?: baz')],
    ['A.kt', lines('list.map { it + 1 }'), lines('list.map {', '    it + 1', '}')],
  ])('reads %s the same before and after formatting', (filePath, before, after) => {
    expect(tokensOf(filePath, before)).toEqual(tokensOf(filePath, after));
  });

  it.each([
    [
      'a.py',
      lines('if flag:', '    flag = 0', '    print(1)'),
      lines('if flag:', '    flag = 0', 'print(1)'),
    ],
    ['a.py', lines('if x:', '    pass', 'print(x)'), lines('if x:', '    pass', '    print(x)')],
    ['a.py', 'print((value,))', 'print((value))'],
    ['a.py', 'a[1,]', 'a[1]'],
    ['a.py', String.raw`print(r"\'")`, `print(r"'")`],
    [
      'a.py',
      lines('def f():', '    return', '    print(1)'),
      lines('def f():', '    return print(1)'),
    ],
    ['a.py', lines('s = """a  b"""'), lines('s = """a b"""')],
    ['a.py', lines('s = "a  b"'), lines('s = "a b"')],
    ['a.ts', 'a + ++b', 'a++ + b'],
    ['a.ts', 'a - --b', 'a-- - b'],
    ['a.ts', 'if (x); f()', 'if (x) f()'],
    ['a.ts', lines('return x.y'), lines('return', 'x.y')],
    ['a.ts', lines('a', ';(function () {})()'), lines('a', '(function () {})()')],
    ['a.ts', 'x = `a  ${b}  c`', 'x = `a ${b} c`'],
    ['a.ts', 'x = /a  b/', 'x = /a b/'],
    ['a.ts', 'x = [,]', 'x = []'],
    ['a.ts', 'x = [a,,]', 'x = [a,]'],
    ['a.ts', 'x = 010', 'x = 10'],
    ['a.ts', String.raw`x = String.raw` + '`\\n  a`', String.raw`x = String.raw` + '`\\n a`'],
    ['A.java', 'if (flag); value = 2;', 'if (flag) value = 2;'],
    ['A.java', 'a > 0 ? a + ++b : b', 'a > 0 ? a++ + b : b'],
    ['A.java', "char c = 'a';", 'char c = "a";'],
    [
      'A.java',
      lines('String s = """', '  a  b', '  """;'),
      lines('String s = """', '  a b', '  """;'),
    ],
    ['A.kt', lines('return', 'a'), lines('return a')],
    ['A.kt', lines('val x = a', '-1'), lines('val x = a - 1')],
    ['A.kt', lines('foo()', '{ x }'), lines('foo() { x }')],
    ['A.kt', 'val s = """a  ${b}"""', 'val s = """a ${b}"""'],
    ['A.kt', '1.toString()', '1.tostring()'],
  ])('tells a real edit of %s apart from formatting', (filePath, before, after) => {
    expect(tokensOf(filePath, before)).not.toEqual(tokensOf(filePath, after));
  });

  it('keeps the tokens of a multi-line string and of a comment on their own lines', () => {
    const described = sourceLines(
      lines('x = 1', 's = """a', '  b"""  # it\'s', 'y = 2'),
      sourceLanguage('a.py'),
    );

    expect(described.map((line) => line.tokens.length)).toEqual([undefined, 4, 3, 4, 4]);
  });

  it('reads the source of a branch line without what a formatter rewrites', () => {
    expect(formatAgnosticText("    if x == 1: print('v1')", 'a.py')).toBe(
      formatAgnosticText('if x == 1:', 'a.py'),
    );
    expect(formatAgnosticText('if (flag); value = 2;', 'A.java')).not.toBe(
      formatAgnosticText('if (flag) value = 2;', 'A.java'),
    );
    expect(formatAgnosticText('a  =  b', 'notes.txt')).toBe('a = b');
  });

  it('aligns only the source languages the presets analyze', () => {
    expect(
      ['a.pyi', 'a.mts', 'a.jsx', 'A.java', 'b.kts', 'c.vue', 'd.yaml'].map(
        (file) => sourceLanguage(file)?.name,
      ),
    ).toEqual(['python', 'javascript', 'javascript', 'java', 'kotlin', undefined, undefined]);
  });
});
