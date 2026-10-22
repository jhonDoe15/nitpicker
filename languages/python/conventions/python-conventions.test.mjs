import { describe, expect, it } from 'vitest';
import { PYTHON_CONVENTIONS } from './python-conventions.mjs';

const measures = Object.fromEntries(PYTHON_CONVENTIONS.map(({ id, measure }) => [id, measure]));
const assignments = (quote) =>
  ['a', 'b', 'c', 'd'].map((name) => `${name} = ${quote}${name}${quote}`).join('\n');

describe('python.quotes', () => {
  it.each([
    ['single quoted strings', `${assignments("'")}\n`, 'single'],
    ['double quoted strings', `${assignments('"')}\n`, 'double'],
    ['too few strings to tell', `a = 'a'\nb = 'b'\n`, undefined],
    ['an even split', `a = 'a'\nb = 'b'\nc = "c"\nd = "d"\n`, undefined],
    [
      'strings that hold the other quote',
      `a = "it's"\nb = 'say "x"'\nc = "it's"\nd = "don't"\n`,
      undefined,
    ],
    ['strings that escape their own quote', `a = 'it\\'s'\nb = 'x\\'y'\nc = 'z\\'z'\n`, undefined],
    ['docstrings and triple quoted text', `"""a"""\nb = '''b'''\nc = """c"""\n`, undefined],
    ['quotes in comments', `# 'a' 'b' 'c'\nx = "a"\ny = "b"\nz = "c"  # 'd'\n`, 'double'],
    ['prefixed strings', `a = f'{x}'\nb = rb'x'\nc = u'y'\nd = "z"\n`, 'single'],
    [
      'an f-string that quotes inside the braces',
      `a = f"{d['k']}"\nb = "x"\nc = "y"\nd = "z"\n`,
      'double',
    ],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['python.quotes'](text)).toBe(expected);
  });
});

describe('python.indentation', () => {
  it.each([
    ['four spaces', 'def f():\n    return 1\n\nclass A:\n    x = 1\n', '4'],
    ['two spaces', 'def f():\n  return 1\n\nclass A:\n  x = 1\n', '2'],
    ['a block that follows a comment', 'if x:\n  # why\n\n  y = 1\n', '2'],
    [
      'a wrapped signature, which adds no step to read',
      'def f(\n    a,\n    b,\n):\n    return a\n',
      undefined,
    ],
    ['a wrapped signature next to a block', 'def f(\n    a,\n):\n  if a:\n    return a\n', '2'],
    ['tabs', 'def f():\n\treturn 1\n\nclass A:\n\tx = 1\n', 'tab'],
    ['nested tabs', 'class A:\n\tdef f(self):\n\t\treturn 1\n', 'tab'],
    [
      'tabs and spaces in equal measure',
      'def f():\n\treturn 1\n\ndef g():\n    return 1\n',
      undefined,
    ],
    [
      'spaces with one tab block',
      'def f():\n    if x:\n        pass\ndef g():\n    pass\ndef h():\n\tpass\n',
      '4',
    ],
    ['no blocks', 'x = 1\n', undefined],
    ['a tie', 'def f():\n  return 1\ndef g():\n    return 1\n', undefined],
    ['dict keys that end a line', 'x = {\n  "key":\n    1,\n}\n', undefined],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['python.indentation'](text)).toBe(expected);
  });
});

describe('python.lineLength', () => {
  const call = (width, name) => `${name}(\n    ${'a'.repeat(width)}\n)\n`;
  const fits = (length) => `x = ${'a'.repeat(length - 4)}\n`;

  it.each([
    [
      'a call wrapped though it fits 100',
      `${fits(75)}run(\n    alpha, beta, gamma, delta, epsilon, zeta, eta\n)\n`,
      undefined,
    ],
    [
      'calls wrapped at 88 but longer lines never reach 100',
      `${fits(70)}result = compute(\n    ${'b'.repeat(70)}\n)\n`,
      '79',
    ],
    ['a magic trailing comma', `${fits(60)}run(\n    a,\n    b,\n)\n`, undefined],
    ['lines past 100 and none past 120', `${fits(110)}\n${fits(115)}\n`, '120'],
    ['one line past 100', `${fits(110)}\n`, undefined],
    ['lines past 120', `${fits(110)}\n${fits(130)}\n`, undefined],
    [
      'long comments, urls and strings',
      `# ${'x'.repeat(200)}\nu = "http://${'a'.repeat(150)}"\n`,
      undefined,
    ],
    ['a long docstring', `"""\n${'word '.repeat(60)}\n"""\n${fits(110)}\n${fits(112)}\n`, '120'],
    ['tabs', `${fits(110)}\n\t${fits(112)}\n`, undefined],
  ])('reads %s', (_name, text, expected) => {
    expect(measures['python.lineLength'](text)).toBe(expected);
  });

  it('names the one width a wrapped group allows', () => {
    const wrapped = `${fits(80)}\nresult = compute(\n    ${'b'.repeat(80)}\n)\n`;

    expect(measures['python.lineLength'](wrapped)).toBe('88');
    expect(measures['python.lineLength'](`${call(60, 'f')}${fits(70)}`)).toBeUndefined();
  });
});
