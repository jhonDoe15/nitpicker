import { describe, expect, it } from 'vitest';
import { languageOf, maskSource } from './mask.mjs';

const comments = (language, text) => maskSource(language, text).comments;
// The masked text keeps its length and its lines; runs of blanks are collapsed to compare shapes.
const shape = (language, text) => {
  const { masked } = maskSource(language, text);
  expect(masked).toHaveLength(text.length);
  expect(masked.split('\n')).toHaveLength(text.split('\n').length);
  return masked.replaceAll(/ +/gu, ' ');
};

describe('languageOf', () => {
  it.each([
    ['src/app.py', 'python'],
    ['src/app.pyi', 'python'],
    ['src/main/java/A.java', 'java'],
    ['src/main/kotlin/A.kt', 'kotlin'],
    ['build.gradle.kts', 'kotlin'],
    ['src/app.ts', undefined],
    ['Makefile', undefined],
  ])('maps %s to %s', (file, language) => {
    expect(languageOf(file)).toBe(language);
  });
});

describe('Python', () => {
  it('finds comments with their lines and keeps a hash inside a string', () => {
    const text = 'x = "a # b"  # real\ny = 1\n# last';
    expect(comments('python', text)).toEqual([
      { text: ' real', line: 1, block: false },
      { text: ' last', line: 3, block: false },
    ]);
    expect(shape('python', text)).toBe('x = " " \ny = 1\n ');
  });

  it('blanks docstrings and triple-quoted strings but keeps their quotes and newlines', () => {
    const text = 'def f():\n    """# noqa\n    text"""\n    return 1  # pragma: no cover\n';
    expect(shape('python', text)).toBe('def f():\n """ \n """\n return 1 \n');
    expect(comments('python', text)).toEqual([
      { text: ' pragma: no cover', line: 4, block: false },
    ]);
  });

  it('follows prefixes, escaped quotes, empty strings and an unterminated string', () => {
    const text = `a = f'it\\'s {x}'  # one\nb = ""  # two\nc = 'open\n# three`;
    expect(comments('python', text).map((comment) => comment.text)).toEqual([
      ' one',
      ' two',
      ' three',
    ]);
  });
});

describe('Java', () => {
  it('blanks line and block comments and string contents, and keeps the code', () => {
    const text = 'int a = 1; // note\n/* block\n   two */ String s = "x // y";\n';
    expect(shape('java', text)).toBe('int a = 1; \n \n String s = " ";\n');
    expect(comments('java', text)).toEqual([
      { text: ' note', line: 1, block: false },
      { text: ' block\n   two ', line: 2, block: true },
    ]);
  });

  it('does not nest block comments and ends a character literal holding a quote', () => {
    const text = '/* a /* b */ char c = \'"\'; String d = "e"; // f';
    expect(shape('java', text)).toBe(' char c = \' \'; String d = " "; ');
  });

  it('blanks text blocks and handles escaped quotes', () => {
    const text = 'String a = """\n  // not a comment\n  """;\nString b = "q\\"r"; // end';
    expect(shape('java', text)).toBe('String a = """\n \n """;\nString b = " "; ');
    expect(comments('java', text)).toEqual([{ text: ' end', line: 4, block: false }]);
  });
});

describe('Kotlin', () => {
  it('nests block comments', () => {
    const text = '/* a /* b */ still comment */ val x = 1';
    expect(shape('kotlin', text)).toBe(' val x = 1');
  });

  it('blanks a string with a template, whose code holds a string of its own', () => {
    const text = 'val s = "id ${map["k"]} // x"; val t = 2 // c';
    expect(shape('kotlin', text)).toBe('val s = " "; val t = 2 ');
    expect(comments('kotlin', text)).toEqual([{ text: ' c', line: 1, block: false }]);
  });

  it('blanks raw strings and leaves backquoted names as written', () => {
    const text = 'val r = """a "quoted" // b"""\nfun `says "hi" // ok`() {}\n';
    expect(shape('kotlin', text)).toBe('val r = """ """\nfun `says "hi" // ok`() {}\n');
  });
});
