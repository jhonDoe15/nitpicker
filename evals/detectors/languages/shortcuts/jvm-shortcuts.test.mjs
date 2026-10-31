import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageCodeShortcuts } from './index.mjs';

const JAVA = 'src/main/java/demo/Cart.java';
const KOTLIN = 'src/main/kotlin/demo/Cart.kt';
const detect = (file, before, after) =>
  detectLanguageCodeShortcuts(toTree({ [file]: before }), toTree({ [file]: after }));
const kinds = (found) => found.map((shortcut) => shortcut.kind);

const javaClass = (body) =>
  `package demo;\n\nclass Cart {\n  int total() {\n${body}\n    return 0;\n  }\n}\n`;
const kotlinClass = (body) =>
  `package demo\n\nclass Cart {\n    fun total(): Int {\n${body}\n        return 0\n    }\n}\n`;
const javaBase = javaClass('');
const kotlinBase = kotlinClass('');

describe('Java catch', () => {
  it.each([
    ['an empty catch', '    try { run(); } catch (IOException e) { }', 'ignored-error'],
    [
      'a catch holding only a comment',
      '    try { run(); } catch (IOException e) {\n      // later\n    }',
      'ignored-error',
    ],
    ['catch (Exception)', '    try { run(); } catch (Exception e) { log(e); }', 'broad-catch'],
    [
      'catch (RuntimeException)',
      '    try { run(); } catch (final RuntimeException e) { log(e); }',
      'broad-catch',
    ],
    ['catch (Throwable)', '    try { run(); } catch (Throwable t) { log(t); }', 'broad-catch'],
    [
      'a multi-catch with Exception',
      '    try { run(); } catch (IOException | Exception e) { log(e); }',
      'broad-catch',
    ],
    [
      'a fully qualified Exception',
      '    try { run(); } catch (java.lang.Exception e) { log(e); }',
      'broad-catch',
    ],
  ])('reports %s', (_name, code, kind) => {
    expect(detect(JAVA, javaBase, javaClass(code))).toMatchObject([
      { category: 'code-shortcuts', kind, path: JAVA },
    ]);
  });

  it('reports an empty broad catch once, as an ignored error', () => {
    const code = '    try { run(); } catch (Exception e) { }';
    expect(kinds(detect(JAVA, javaBase, javaClass(code)))).toEqual(['ignored-error']);
  });

  it.each([
    ['a narrow catch that handles', '    try { run(); } catch (IOException e) { log(e); }'],
    ['a catch of a longer name', '    try { run(); } catch (MyException e) { log(e); }'],
    ['a catch in a string', '    String s = "catch (Exception e) { }";'],
    ['a catch in a comment', '    // catch (Exception e) { }'],
  ])('does not report %s', (_name, code) => {
    expect(detect(JAVA, javaBase, javaClass(code))).toEqual([]);
  });

  it('reports the line of the catch and not a catch the file already had', () => {
    const before = javaClass('    try { run(); } catch (Exception e) { log(e); }');
    expect(detect(JAVA, before, `// header\n${before}`)).toEqual([]);
    const found = detect(
      JAVA,
      before,
      javaClass('    try { a(); } catch (Throwable t) { log(t); }'),
    );
    expect(found).toMatchObject([{ line: 5, detail: expect.stringContaining('Throwable') }]);
  });

  it('does not check non-null assertions, which Java does not have', () => {
    expect(detect(JAVA, javaBase, javaClass('    var a = b; x!!;'))).toEqual([]);
  });
});

describe('Kotlin catch', () => {
  it.each([
    ['an empty catch', '        try { run() } catch (e: IOException) { }', 'ignored-error'],
    [
      'catch (e: Exception)',
      '        try { run() } catch (e: Exception) { log(e) }',
      'broad-catch',
    ],
    [
      'catch (e: Throwable)',
      '        try { run() } catch (e: Throwable) { log(e) }',
      'broad-catch',
    ],
  ])('reports %s', (_name, code, kind) => {
    expect(kinds(detect(KOTLIN, kotlinBase, kotlinClass(code)))).toEqual([kind]);
  });

  it('does not report a narrow catch that handles', () => {
    const code = '        try { run() } catch (e: IOException) { log(e) }';
    expect(detect(KOTLIN, kotlinBase, kotlinClass(code))).toEqual([]);
  });
});

describe('Kotlin non-null assertion and cast', () => {
  it.each([
    ['x!!', '        val a = x!!', 'x!!'],
    ['a call result with !!', '        val a = load()!!.name', 'load()!!'],
    ['a chain with !!', '        val a = user.name!!', 'user.name!!'],
  ])('reports %s', (_name, code, shown) => {
    expect(detect(KOTLIN, kotlinBase, kotlinClass(code))).toMatchObject([
      { kind: 'non-null-assertion', detail: `non-null assertion: ${shown}` },
    ]);
  });

  it('reports an unsafe as with its type', () => {
    expect(
      detect(KOTLIN, kotlinBase, kotlinClass('        val a = x as List<String>')),
    ).toMatchObject([{ kind: 'type-assertion', detail: 'unsafe cast: as List<String>' }]);
    expect(kinds(detect(KOTLIN, kotlinBase, kotlinClass('        val a = x as String?')))).toEqual([
      'type-assertion',
    ]);
  });

  it.each([
    ['a safe cast', '        val a = x as? String'],
    ['!= comparison', '        val a = x != y'],
    ['!! in a string', '        val a = "x!!"'],
    ['as in a comment', '        // x as String'],
    ['a nullable type', '        val a: String? = null'],
  ])('does not report %s', (_name, code) => {
    expect(detect(KOTLIN, kotlinBase, kotlinClass(code))).toEqual([]);
  });

  it('does not report an import rename', () => {
    const imported = `package demo\n\nimport java.util.List as JList\n${kotlinBase}`;
    expect(detect(KOTLIN, kotlinBase, imported)).toEqual([]);
  });

  it('reports only occurrences the final file adds', () => {
    const before = kotlinClass('        val a = x!!');
    expect(detect(KOTLIN, before, `// moved\n${before}`)).toEqual([]);
    expect(
      kinds(detect(KOTLIN, before, kotlinClass('        val a = x!!\n        val b = x!!'))),
    ).toEqual(['non-null-assertion']);
  });
});

describe('JVM test files', () => {
  it('allows casts in tests but not !!, broad catches or an empty catch', () => {
    const test = 'src/test/kotlin/demo/CartTest.kt';
    const code =
      'class CartTest {\n    fun a() {\n        val x = y!!\n        val z = x as String\n        try { run() } catch (e: Exception) { }\n        try { run() } catch (e: Exception) { log(e) }\n    }\n}\n';
    expect(kinds(detectLanguageCodeShortcuts(toTree({}), toTree({ [test]: code })))).toEqual([
      'ignored-error',
      'broad-catch',
      'non-null-assertion',
    ]);
  });
});
