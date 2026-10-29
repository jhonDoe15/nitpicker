import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageCodeShortcuts } from './index.mjs';

const detect = (file, before, after) =>
  detectLanguageCodeShortcuts(toTree({ [file]: before }), toTree({ [file]: after }));
const kinds = (found) => found.map((shortcut) => shortcut.kind);

const JAVA = 'src/main/java/demo/Cart.java';
const KOTLIN = 'src/main/kotlin/demo/Cart.kt';
const PYTHON = 'src/demo/cart.py';
const javaClass = (body) =>
  `package demo;\n\nclass Cart {\n  int total() {\n${body}\n    return 0;\n  }\n}\n`;
const kotlinClass = (body) =>
  `package demo\n\nclass Cart {\n    fun total(): Int {\n${body}\n        return 0\n    }\n}\n`;
const inJava = (body) => detect(JAVA, javaClass(''), javaClass(body));
const inKotlin = (body) => detect(KOTLIN, kotlinClass(''), kotlinClass(body));

describe('Kotlin !! found by tokens', () => {
  it.each([
    ['after an index', '        val a = rows["k"]!!', 'rows[" "]!!'],
    ['after a call', '        val a = rows.first(1)!!', 'rows.first(1)!!'],
    [
      'after a call with a lambda',
      '        val a = rows.find { it > 1 }!!',
      'rows.find { it > 1 }!!',
    ],
    ['before a member access', '        val a = rows[0]!!.name', 'rows[0]!!'],
  ])('reports !! %s', (_name, code, operand) => {
    expect(inKotlin(code)).toMatchObject([
      { kind: 'non-null-assertion', detail: `non-null assertion: ${operand}` },
    ]);
  });

  it.each([
    ['in a string', '        val a = "rows[0]!!"'],
    ['in a comment', '        // rows[0]!!'],
    ['in a template string', '        val a = "${rows.size}"'],
  ])('does not report !! %s', (_name, code) => {
    expect(inKotlin(code)).toEqual([]);
  });
});

describe('Kotlin as', () => {
  it('reports a cast that spans lines', () => {
    expect(kinds(inKotlin('        val a = x\n            as String'))).toEqual(['type-assertion']);
  });

  it('does not report a cast after an is check of the same value and type', () => {
    expect(inKotlin('        if (x is String) { val a = x as String }')).toEqual([]);
    expect(kinds(inKotlin('        if (x is Int) { val a = x as String }'))).toEqual([
      'type-assertion',
    ]);
  });
});

describe('Java casts', () => {
  it.each([
    ['a class', '    var a = (String) b;', 'String'],
    ['a generic type', '    var a = (List<String>) b;', 'List<String>'],
    ['a qualified type', '    var a = (java.util.List) b;', 'java.util.List'],
    ['a type variable', '    var a = (T) b;', 'T'],
    ['a cast of a call', '    var a = (Cart) load();', 'Cart'],
    ['a cast after return', '    return (Cart) b;', 'Cart'],
  ])('reports %s', (_name, code, type) => {
    expect(inJava(code)).toMatchObject([
      { kind: 'type-assertion', detail: `unsafe cast: (${type})` },
    ]);
  });

  it.each([
    ['a primitive conversion', '    var a = (int) b;'],
    ['a parenthesised constant', '    if (DEBUG) run();'],
    ['a call', '    run(Cart) ;'],
    ['a cast after an instanceof check', '    if (b instanceof Cart) { var a = (Cart) b; }'],
    ['a cast in a string', '    var a = "(String) b";'],
    ['a lambda', '    var a = (Cart) -> 1;'],
  ])('does not report %s', (_name, code) => {
    expect(inJava(code)).toEqual([]);
  });
});

describe('Error handling reported the same way in every language', () => {
  it.each([
    ['Java return null', () => inJava('    try { run(); } catch (IOException e) { return null; }')],
    ['Kotlin null', () => inKotlin('        try { run() } catch (e: IOException) { null }')],
    ['Python return null', () => pythonCatch('except OSError:\n        return None')],
    ['Java empty', () => inJava('    try { run(); } catch (IOException e) { }')],
    ['Python pass', () => pythonCatch('except KeyError:\n        pass')],
  ])('%s is an ignored error', (_name, found) => {
    expect(kinds(found())).toEqual(['ignored-error']);
  });

  it.each([
    ['Java Exception', () => inJava('    try { run(); } catch (Exception e) { log(e); }')],
    ['Java NPE', () => inJava('    try { run(); } catch (NullPointerException e) { log(e); }')],
    ['Kotlin Exception', () => inKotlin('        try { run() } catch (e: Exception) { log(e) }')],
    ['Python Exception', () => pythonCatch('except Exception as e:\n        log(e)')],
  ])('%s that only logs is a broad catch', (_name, found) => {
    expect(kinds(found())).toEqual(['broad-catch']);
  });

  it.each([
    [
      'Java',
      () =>
        inJava(
          '    try { run(); } catch (Exception e) { throw new IllegalStateException("x", e); }',
        ),
    ],
    [
      'Kotlin',
      () =>
        inKotlin(
          '        try { run() } catch (e: Exception) { throw IllegalStateException("x", e) }',
        ),
    ],
    ['Python', () => pythonCatch('except Exception as e:\n        raise ValueError("x") from e')],
  ])('%s that rethrows with the cause is neither', (_name, found) => {
    expect(found()).toEqual([]);
  });

  it('reports runCatching(...).getOrNull() in Kotlin', () => {
    expect(kinds(inKotlin('        val a = runCatching { load() }.getOrNull()'))).toEqual([
      'ignored-error',
    ]);
    expect(inKotlin('        val a = runCatching { load() }.getOrThrow()')).toEqual([]);
  });
});

const pythonCatch = (handler) =>
  detect(PYTHON, 'X = 1\n', `X = 1\n\n\ndef load():\n    try:\n        run()\n    ${handler}\n`);

describe('Python aliases', () => {
  it('reports Any and cast under an alias', () => {
    const code = 'from typing import Any as A, cast as c\n\n\ndef f(x: A):\n    return c(int, x)\n';
    expect(kinds(detect(PYTHON, 'X = 1\n', code))).toEqual(['any', 'type-assertion']);
  });

  it('does not report a name that is not imported from typing', () => {
    expect(detect(PYTHON, 'X = 1\n', 'def f(x: A):\n    return c(int, x)\n')).toEqual([]);
  });
});

describe('Python dynamic imports of another feature', () => {
  const tree = {
    'src/demo/features/billing/__init__.py': '',
    'src/demo/features/billing/rules.py': 'RATE = 1\n',
    'src/demo/features/orders/__init__.py': '',
  };
  const file = 'src/demo/features/orders/service.py';

  it('reports import_module of an internal module', () => {
    const code =
      'import importlib\n\nmod = importlib.import_module("demo.features.billing.rules")\n';
    expect(
      kinds(detectLanguageCodeShortcuts(toTree(tree), toTree({ ...tree, [file]: code }))),
    ).toEqual(['cross-feature-import']);
  });
});
