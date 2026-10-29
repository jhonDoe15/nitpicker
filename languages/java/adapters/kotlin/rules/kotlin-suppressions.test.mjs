import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
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
    expect(suppressionTokens(source)).toEqual(['A']);
  });

  it('reads both arguments when the first holds a comment opener', () => {
    expect(suppressionTokens('@Suppress("a//b", "A") fun f() = 1')).toEqual(['a//b', 'A']);
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
        '@Suppress("UnsafeCallOnNullableType", "rawtypes")\nfun a() = 1\n@Suppress("all")\nfun b() = 2\n',
    });

    expect(readSuppressionFindings(root, { sourceRoots: ['src/main/kotlin'] })).toEqual([
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: file,
        identity: 'suppress:UnsafeCallOnNullableType',
        message:
          'Suppressing "UnsafeCallOnNullableType" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json. If this is intended, add {"rule":"inline-suppression","paths":["src/main/kotlin/demo/A.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm:
          'Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.',
        classification: 'enforceable',
      },
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: file,
        identity: 'suppress:all',
        message:
          'Suppressing "all" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json. If this is intended, add {"rule":"inline-suppression","paths":["src/main/kotlin/demo/A.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm:
          'Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.',
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
      readSuppressionFindings(root, { sourceRoots: ['src/main/kotlin'] }).map(
        ({ path: file_, identity }) => [file_, identity],
      ),
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
      readSuppressionFindings(root, {
        sourceRoots: ['src/main/kotlin', 'src/main/java'],
        testRoots: ['src/main/kotlin'],
      }).map(({ path: found }) => found),
    ).toEqual(['src/main/java/Mixed.kt', 'src/main/kotlin/A.kt', 'src/main/kotlin/z/Deep.kt']);
  });

  it('reports a suppressed compiler warning with the exception route of its kotlinc rule', () => {
    const root = projectWith({
      [file]: '@Suppress("UNCHECKED_CAST")\nfun a(value: Any) = value as List<String>\n',
    });

    expect(
      readSuppressionFindings(root, { sourceRoots: ['src/main/kotlin'] }).map(
        ({ message }) => message,
      ),
    ).toEqual([
      `Suppressing "UNCHECKED_CAST" inline is not allowed. Fix the code the compiler warns about. ${exceptionHint('kotlinc/unchecked', file)}`,
    ]);
  });

  it('bans compiler-warning tokens in main sources only, which the kotlinc lint compiles, and rule tokens everywhere', () => {
    const suppressed =
      '@Suppress("UNCHECKED_CAST", "DEPRECATION", "MagicNumber")\nfun a(value: Any) = value as List<String>\n';
    const root = projectWith({
      'src/main/kotlin/A.kt': suppressed,
      'src/test/kotlin/ATest.kt': suppressed,
    });

    expect(
      readSuppressionFindings(root, {
        sourceRoots: ['src/main/kotlin'],
        testRoots: ['src/test/kotlin'],
      }).map(({ path: found, identity }) => `${found} ${identity}`),
    ).toEqual([
      'src/main/kotlin/A.kt suppress:UNCHECKED_CAST',
      'src/main/kotlin/A.kt suppress:DEPRECATION',
      'src/main/kotlin/A.kt suppress:MagicNumber',
      'src/test/kotlin/ATest.kt suppress:MagicNumber',
    ]);
  });

  it('reports nothing for allowed suppressions, comments and missing source roots', () => {
    const root = projectWith({
      [file]: '@Suppress("rawtypes", "UNUSED_VALUE")\nfun a() = 42\n// @Suppress("all")\n',
    });

    expect(
      readSuppressionFindings(root, { sourceRoots: ['src/main/kotlin', 'src/main/missing'] }),
    ).toEqual([]);
  });

  describe('the suppressions of unused code', () => {
    const found = (files, roots = {}) =>
      readSuppressionFindings(projectWith(files), {
        sourceRoots: ['src/main/kotlin'],
        ...roots,
      }).map(({ identity }) => identity);

    it.each([
      ['a function with parameters', '@Suppress("unused")\nfun a(x: Int) = 1\n'],
      ['a parameter', 'fun a(@Suppress("UNUSED_PARAMETER") x: Int) = 1\n'],
      [
        'a function with a local function with parameters',
        '@Suppress("unused")\nfun a() {\n    fun b(x: Int) = x\n}\n',
      ],
      [
        'a class with a function with parameters',
        '@Suppress("unused")\nclass A {\n    fun f(x: Int) = 1\n}\n',
      ],
      [
        'a file with a function with parameters',
        '@file:Suppress("unused")\npackage demo\nfun a(x: Int) = 1\n',
      ],
      [
        'a function after other annotations',
        '@Suppress("UNUSED_VARIABLE")\n@Deprecated("x")\nprivate fun a(x: Int) = 1\n',
      ],
    ])('are banned on %s', (_name, source) => {
      expect(found({ [file]: source })).toHaveLength(1);
    });

    it.each([
      [
        'a function without parameters',
        '@Suppress("unused")\nfun Application.module() { routing { } }\n',
      ],
      ['a property', '@Suppress("unused")\nprivate val registry = mutableMapOf<String, Int>()\n'],
      [
        'a class without a function with parameters',
        '@Suppress("unused")\nclass A {\n    val y = 1\n}\n\nfun other(z: Int) = z\n',
      ],
      [
        'a class without a body',
        '@Suppress("unused")\nclass A(val y: Int)\n\nfun other(z: Int) = z\n',
      ],
      ['a file without functions', '@file:Suppress("unused")\npackage demo\nval a = 1\n'],
    ])('are allowed on %s', (_name, source) => {
      expect(found({ [file]: source })).toEqual([]);
    });

    it('are allowed in test sources', () => {
      expect(
        found(
          { 'src/test/kotlin/ATest.kt': '@Suppress("unused")\nfun a(x: Int) = 1\n' },
          { testRoots: ['src/test/kotlin'] },
        ),
      ).toEqual([]);
    });

    it('name the parameter and the route for other unused code', () => {
      const [{ message, allowedForm }] = readSuppressionFindings(
        projectWith({ [file]: '@Suppress("unused")\nfun a(x: Int) = 1\n' }),
        { sourceRoots: ['src/main/kotlin'] },
      );

      expect(message).toBe(
        `Suppressing "unused" inline would hide an unused parameter. Remove the parameter, or use it; a name starting \`ignored\` or \`unused\` marks one a signature requires. When reflection or a framework calls it with that signature, remove the suppression and lift the rule for this path instead. ${exceptionHint('detekt.style.UnusedParameter', file)}`,
      );
      expect(allowedForm).toBe(
        'Remove the parameter, or use it; a name starting `ignored` or `unused` marks one a signature requires.',
      );
    });

    it('bans a suppression qualified by a rule set', () => {
      expect(
        found({
          [file]: '@Suppress("style:UnusedParameter", "style.UnusedParameter")\nfun a() = 1\n',
        }),
      ).toEqual(['suppress:style:UnusedParameter', 'suppress:style.UnusedParameter']);
    });
  });
});
