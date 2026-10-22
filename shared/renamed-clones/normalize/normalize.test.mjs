import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { normalizeSource } from './normalize.mjs';

const squash = (text) => text.replace(/\s+/gu, '');

function normalize(text, fileName, syntax) {
  return normalizeSource({ text, fileName, syntax, typescript: ts });
}

function lineCount(text) {
  return text.split('\n').length;
}

describe('Python sources', () => {
  const source = [
    'import os',
    'from app import (first,',
    '    second)',
    '__all__ = ["first"]',
    'ROWS = [("a", 1), ("b", 2)]',
    '@cached(60)',
    'def total(items, rate=1.5e3):  # sum it',
    '    """Docstring # not a comment',
    '    over lines."""',
    '    value = {"k": 1}',
    '    for item in items:',
    '        if item.price > 0 and f"{item.name}" == r"x#y":',
    '            value[item.key] = item.price * rate',
    '    return value',
    '',
  ].join('\n');

  it('renames names, strings and numbers, and drops comments, imports and data', () => {
    expect(squash(normalize(source, 'a.py', 'python'))).toBe(
      squash(
        '_ = 0 @_(0) def _(_, _=0): "" _ = 0 for _ in _: if _._ > 0 and "" == "": ' +
          '_[_._] = _._ * _ return _',
      ),
    );
  });

  it('keeps every line break, so findings map back to the original lines', () => {
    expect(lineCount(normalize(source, 'a.py', 'python'))).toBe(lineCount(source));
  });

  it('treats a bracket after a name as a call or a subscript, not as a data literal', () => {
    expect(squash(normalize('run([1, 2])\nvalue[0] = (1, 2)\n', 'a.py', 'python'))).toBe(
      squash('_ (0) _ [0] = 0'),
    );
  });

  it('keeps a literal list that holds a name', () => {
    expect(squash(normalize('names = [first, 1]\n', 'a.py', 'python'))).toBe(squash('_ = [_ , 0]'));
  });

  it('treats a dict of qualified enum names as data, and keeps a call on a qualified name', () => {
    const text = 'NAMES = {\n    Status.NEW: "new",\n    Status.OLD: "old",\n}\nrun(Status.NEW)\n';

    expect(squash(normalize(text, 'a.py', 'python'))).toBe(squash('_ = 0 _(_._)'));
  });
});

describe('Kotlin sources', () => {
  const source = [
    'package demo.app',
    'import demo.other.*',
    '/* block /* nested */ still comment */',
    'class Cart(private val items: List<Item>) {',
    '    fun label(name: String): String {',
    '        val table = mapOf("a" to 1, "b" to 2)',
    '        val text = """raw $name',
    '        text"""',
    '        return "x ${items.map { "q" }} $name" + \'c\' + `weird name`',
    '    }',
    '}',
    '',
  ].join('\n');

  it('renames names, strings, templates and numbers, and drops comments and imports', () => {
    expect(squash(normalize(source, 'A.kt', 'kotlin'))).toBe(
      squash(
        'class _(_ val _: _<_>) { fun _(_: _): _ { val _ = _ 0 val _ = "" return "" + "" + _ } }',
      ),
    );
  });

  it('keeps every line break', () => {
    expect(lineCount(normalize(source, 'A.kt', 'kotlin'))).toBe(lineCount(source));
  });

  it('keeps a call that holds a name', () => {
    expect(squash(normalize('val x = listOf(first, 2)\n', 'A.kt', 'kotlin'))).toBe(
      squash('val _ = _(_, 0)'),
    );
  });

  it('treats a when table of qualified names and a map of them as data, and keeps logic', () => {
    const text = [
      'fun name(c: Color) = when (c) {',
      '    Color.RED -> "red"',
      '    Color.BLUE -> "blue"',
      '}',
      'val table = mapOf(Color.RED to 1)',
      'fun pick(c: Int) = when (c) {',
      '    1 -> run(c)',
      '    else -> 0',
      '}',
      '',
    ].join('\n');

    expect(squash(normalize(text, 'A.kt', 'kotlin'))).toBe(
      squash('fun _(_: _) = when (_) 0 val _ = _ 0 fun _(_: _) = when (_) { 0 -> _(_) else -> 0 }'),
    );
  });
});

describe('Java sources', () => {
  const source = [
    'package demo.app;',
    'import java.util.List;',
    '/* block */',
    'class Cart {',
    '    private static final int[] SIZES = {1, 2};',
    '    String label(List<Item> items, char mark) {',
    '        var names = List.of("a", "b");',
    '        String text = """',
    '            raw "quoted" text',
    '            """;',
    "        return items.get(0).name + mark + 'c' + 1.5f; // tail",
    '    }',
    '}',
    '',
  ].join('\n');

  it('renames names, strings, characters and numbers, and drops comments, imports and data', () => {
    expect(squash(normalize(source, 'Cart.java', 'java'))).toBe(
      squash(
        'class _ { private static final int[] _ = 0; _ _(_<_> _, char _) { var _ = _._ 0; ' +
          '_ _ = ""; return _._(0)._ + _ + "" + 0; } }',
      ),
    );
  });

  it('keeps every line break', () => {
    expect(lineCount(normalize(source, 'Cart.java', 'java'))).toBe(lineCount(source));
  });
});

describe('TypeScript and JavaScript sources', () => {
  const source = [
    "import { a } from './a';",
    '// comment',
    'interface Shape { width: number }',
    "const TABLE = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];",
    'class Box { private readonly width: number; height = 5; area = compute(); }',
    'export function Card({ items, onPick }: Props) {',
    '  /* note */',
    '  const total = items.reduce((sum, item) => sum + item.price * 2, 0);',
    '  const label = `total ${total} of ${items.length}`;',
    '  const pattern = /ab+c/u;',
    '  return (',
    '    <section className="card" data-x={1}>',
    '      <h1>{title}</h1>',
    '      <ul>{items.map((item) => <li key={item.id} onClick={() => onPick(item)}>{item.name}</li>)}</ul>',
    '      {total > 5 && <b>big</b>}',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');

  it('drops imports, types, data tables, fields, comments and markup, and keeps the logic', () => {
    expect(squash(normalize(source, 'card.tsx', 'typescript'))).toBe(
      squash(
        'const _ = 0; class _ { _ = _(); } export function _({ _, _ }: _) { ' +
          'const _ = _._((_, _) => _ + _._ * 0, 0); const _ = `${_}${_._}`; const _ = /_/; ' +
          'return ( {_._((_) => () => _(_))} {_ > 0 && } ); }',
      ),
    );
  });

  it('keeps every line break', () => {
    expect(lineCount(normalize(source, 'card.tsx', 'typescript'))).toBe(lineCount(source));
  });

  it('reads plain JavaScript too', () => {
    expect(
      squash(normalize("const x = require('y');\nmodule.exports = x;\n", 'a.js', 'typescript')),
    ).toBe(squash('const _ = _(""); _._ = _;'));
  });

  it('rejects a syntax it does not know', () => {
    expect(() => normalize('', 'a.rb', 'ruby')).toThrow('Unknown syntax ruby');
  });
});
