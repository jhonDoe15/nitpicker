import { describe, expect, it } from 'vitest';
import { KOTLIN_CONVENTIONS } from './kotlin-conventions.mjs';

const measures = Object.fromEntries(KOTLIN_CONVENTIONS.map(({ id, measure }) => [id, measure]));

describe('kotlin.indentation', () => {
  it.each([
    ['two spaces', 'class A {\n  fun a() {\n    call()\n  }\n}\n', '2'],
    ['four spaces', 'class A {\n    fun a() {\n        call()\n    }\n}\n', '4'],
    [
      'a wrapped call, which is no block',
      'class A {\n  fun a() {\n    call(\n        first,\n        second)\n  }\n}\n',
      '2',
    ],
    ['tabs', 'class A {\n\tfun a() {}\n}\n', undefined],
    ['a flat file', 'package demo\n\nval a = 1\n', undefined],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['kotlin.indentation'](text)).toBe(expected);
  });
});

describe('kotlin.wildcardImports', () => {
  it.each([
    ['explicit imports', 'package a\n\nimport b.C\nimport b.D\n', 'explicit'],
    ['one wildcard among explicit imports', 'package a\n\nimport b.C\nimport d.*\n', 'wildcard'],
    ['an alias', 'package a\n\nimport b.C as D\n', 'explicit'],
    ['no imports', 'package a\n\nval a = 1\n', undefined],
    [
      'java.util.*, which the tools allow by default',
      'package a\n\nimport java.util.*\nimport b.C\n',
      'explicit',
    ],
    [
      'the android synthetics, allowed too',
      'package a\n\nimport kotlinx.android.synthetic.main.*\n',
      'explicit',
    ],
    ['java.io.*', 'package a\n\nimport java.io.*\n', 'wildcard'],
    ['an import mentioned in a comment', '// import a.*\npackage a\n\nimport b.C\n', 'explicit'],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['kotlin.wildcardImports'](text)).toBe(expected);
  });
});

describe('kotlin.trailingCommas', () => {
  const wrapped = (last) => `val a = call(\n    first,\n    ${last}\n)\n`;

  it.each([
    ['commas after the last argument', `${wrapped('second,')}${wrapped('third,')}`, 'always'],
    ['no comma after the last argument', `${wrapped('second')}${wrapped('third')}`, 'never'],
    ['a mix that leans to commas', `${wrapped('a,')}${wrapped('b,')}${wrapped('c')}`, 'always'],
    ['one wrapped list only', wrapped('second'), undefined],
    ['a tie', `${wrapped('a,')}${wrapped('b')}`, undefined],
    [
      'a constructor and a declaration',
      'class A(\n    val a: Int,\n    val b: Int,\n)\nfun f(\n    a: Int,\n    b: Int,\n) = a\n',
      'always',
    ],
    [
      'a trailing comment after the comma',
      'val a = call(\n    x, // why\n)\nval b = call(\n    y,\n)\n',
      'always',
    ],
    [
      'a lambda as the last argument',
      'val a = call(\n    first,\n    { it }\n)\nval b = call(\n    x,\n    { it }\n)\n',
      'never',
    ],
    [
      'conditions, which take no trailing comma',
      'fun f() {\n    if (\n        a &&\n        b\n    ) {\n    }\n    while (\n        a\n    ) {\n    }\n}\n',
      undefined,
    ],
    ['lists on one line', 'val a = call(first, second)\nval b = call(third)\n', undefined],
    [
      'commented out arguments',
      'val a = call(\n    first,\n    // second\n)\nval b = call(\n    x,\n)\n',
      'always',
    ],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['kotlin.trailingCommas'](text)).toBe(expected);
  });
});

describe('kotlin.lineLength', () => {
  const fits = (length) => `val x = ${'a'.repeat(length - 8)}\n`;
  const wrapped = (width) => `val y = call(\n    ${'b'.repeat(width)}\n)\n`;
  const multi = 'val z = call(\n    first,\n    second,\n)\n';

  it.each([
    ['a call wrapped though it fits 100', `${fits(70)}${wrapped(70)}`, undefined],
    ['wrapped calls that would not fit 100', `${fits(98)}${wrapped(97)}`, '100'],
    ['wrapped calls that would not fit 120', `${fits(118)}${wrapped(117)}`, '120'],
    ['a multi-argument list that would fit 100 when joined', `${fits(60)}${multi}`, undefined],
    ['lines past 100 and none past 120', `${fits(110)}${fits(115)}`, '120'],
    ['lines past 120 and none past 140', `${fits(130)}${fits(135)}`, '140'],
    ['one long line only', fits(110), undefined],
    ['lines past 140', `${fits(150)}${fits(160)}`, undefined],
    ['short lines', `${fits(40)}${fits(60)}`, undefined],
    [
      'long lines nothing can break: imports, urls, comments and long strings',
      `import ${'a'.repeat(130)}\n// ${'b'.repeat(130)}\nval u = "https://${'c'.repeat(130)}"\n${fits(60)}`,
      undefined,
    ],
    ['a raw string', `val t = """\n${'x = ('.repeat(30)}\n"""\n${fits(60)}`, undefined],
    ['tab indentation', `fun a() {\n\t${fits(125)}}\n`, undefined],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['kotlin.lineLength'](text)).toBe(expected);
  });
});
