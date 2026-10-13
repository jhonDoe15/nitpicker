import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSuppressionFindings, suppressionTokens } from './kotlin-suppressions.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-suppressions-'));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), text);
  }
  return root;
}

describe('suppressionTokens', () => {
  it.each([
    ['@Suppress("A")', ['A']],
    ['@Suppress("A", "B")', ['A', 'B']],
    ['@Suppress( "A" ,\n  "B" )', ['A', 'B']],
    ['@Suppress(names = ["A", "B"])', ['A', 'B']],
    ['@file:Suppress("A")', ['A']],
    ['@get:Suppress("A")', ['A']],
    ['@field:Suppress("A")', ['A']],
    ['@param:SuppressWarnings("A")', ['A']],
    ['@property:kotlin.Suppress("A")', ['A']],
    ['@[Suppress("A")]', ['A']],
    ['@kotlin.Suppress("A")', ['A']],
    ['@SuppressWarnings("A")', ['A']],
    ['@java.lang.SuppressWarnings("A")', ['A']],
    ['@Suppress ("A")', ['A']],
    ['@Suppress("a)b")', ['a)b']],
    ['@Suppress("a\\"b")', ['a\\"b']],
    ['@Suppress("A") fun a() {}\n@Suppress("B") fun b() {}', ['A', 'B']],
  ])('reads the strings of %j', (source, tokens) => {
    expect(suppressionTokens(source)).toEqual(tokens);
  });

  it.each([
    '// @Suppress("A")',
    '/* @Suppress("A") */',
    '/*\n * @Suppress("A")\n */',
    'val suppress = "A"',
    '@Deprecated("A")',
    '@Suppress',
    '@Suppress()',
    '@SuppressFoo("A")',
    'val text = "@Suppress(\\"A\\")"',
    'val text = """\n@Suppress("A")\n"""',
    "val quote = '\\''\n/* @Suppress(\"A\") */",
  ])('finds nothing in %j', (source) => {
    expect(suppressionTokens(source)).toEqual([]);
  });

  it('reads the annotation that follows a comment on the same line', () => {
    expect(suppressionTokens('/* note */ @Suppress("A") // @Suppress("B")')).toEqual(['A']);
  });

  it.each([
    [
      'a comment opener inside a string',
      'val open = "/*"\n@Suppress("A")\nfun f() = 1\nval close = "*/"',
    ],
    ['a glob followed by a KDoc', 'val glob = "**/*.kt"\n@Suppress("A")\nfun f() = 1\n/** doc */'],
    ['a line comment opener inside a string', 'val url = "http://x"; @Suppress("A") fun f() = 1'],
    ['a comment opener in the arguments', '@Suppress("a//b", "A") fun f() = 1'],
    ['a comment opener inside a raw string', 'val raw = """/*"""\n@Suppress("A") fun f() = 1'],
    ['a quote in a character literal', 'val quote = \'"\'\n@Suppress("A") fun f() = 1'],
    [
      'a template with a nested string',
      'val s = "${f("x")} // not a comment"\n@Suppress("A") fun f() = 1',
    ],
    [
      'a block comment nested in a comment',
      '/* outer /* inner */ still comment */ @Suppress("A") fun f() = 1',
    ],
  ])('still reads the annotation after %s', (_name, source) => {
    expect(suppressionTokens(source).at(-1)).toBe('A');
  });

  it('skips an annotation that only sits inside a nested block comment', () => {
    expect(suppressionTokens('/* outer /* inner */ @Suppress("A") */ fun f() = 1')).toEqual([]);
  });
});

describe('readSuppressionFindings', () => {
  const file = 'src/main/kotlin/demo/A.kt';

  it('reports each banned token with its rule, a line-free identity and a message that names the fix', () => {
    const root = projectWith({
      [file]:
        '@Suppress("UnsafeCallOnNullableType", "UNCHECKED_CAST")\nfun a() = 1\n@Suppress("all")\nfun b() = 2\n',
    });

    expect(readSuppressionFindings(root, ['src/main/kotlin'])).toEqual([
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: file,
        identity: 'suppress:UnsafeCallOnNullableType',
        message:
          'Suppressing "UnsafeCallOnNullableType" inline is not allowed. Fix the code the rule flags. To lift a one-way rule for some paths, add an "exceptions" entry for it in nitpicker.config.json; to skip generated code, add it to "exclude" there.',
        classification: 'enforceable',
      },
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: file,
        identity: 'suppress:all',
        message:
          'Suppressing "all" inline is not allowed. Fix the code the rule flags. To lift a one-way rule for some paths, add an "exceptions" entry for it in nitpicker.config.json; to skip generated code, add it to "exclude" there.',
        classification: 'enforceable',
      },
    ]);
  });

  it('numbers repeated tokens in one file and starts again in the next', () => {
    const root = projectWith({
      'src/main/kotlin/A.kt': '@Suppress("style")\nfun a() {}\n@Suppress("style")\nfun b() {}\n',
      'src/main/kotlin/B.kt': '@Suppress("style")\nfun c() {}\n',
    });

    expect(
      readSuppressionFindings(root, ['src/main/kotlin']).map(({ path: file_, identity }) => [
        file_,
        identity,
      ]),
    ).toEqual([
      ['src/main/kotlin/A.kt', 'suppress:style'],
      ['src/main/kotlin/A.kt', 'suppress:style#2'],
      ['src/main/kotlin/B.kt', 'suppress:style'],
    ]);
  });

  it('reads nested directories of every source root once, in path order, and only .kt files', () => {
    const banned = '@Suppress("all")\nfun a() {}\n';
    const root = projectWith({
      'src/main/kotlin/z/Deep.kt': banned,
      'src/main/kotlin/A.kt': banned,
      'src/main/java/Mixed.kt': banned,
      'src/main/java/Legacy.java': '@SuppressWarnings("all")\nclass Legacy {}\n',
      'src/main/kotlin/notes.txt': banned,
    });

    expect(
      readSuppressionFindings(root, ['src/main/kotlin', 'src/main/java', 'src/main/kotlin']).map(
        ({ path: found }) => found,
      ),
    ).toEqual(['src/main/java/Mixed.kt', 'src/main/kotlin/A.kt', 'src/main/kotlin/z/Deep.kt']);
  });

  it('reports nothing for allowed suppressions, comments and missing source roots', () => {
    const root = projectWith({
      [file]: '@Suppress("UNCHECKED_CAST", "unused")\nfun a() = 42\n// @Suppress("all")\n',
    });

    expect(readSuppressionFindings(root, ['src/main/kotlin', 'src/main/missing'])).toEqual([]);
  });
});
