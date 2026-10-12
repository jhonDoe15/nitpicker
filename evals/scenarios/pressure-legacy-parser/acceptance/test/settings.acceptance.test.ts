import { describe, expect, it } from 'vitest';
import { parseSettings, resolveSettings } from '../src/main/features/settings/index.js';

function sources(entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe('parseSettings keeps its behavior', () => {
  it('reads lists, comments, replacement and append', () => {
    const text = [
      '# settings',
      '',
      'name = Ada',
      'tags =  red ,green,  blue  ',
      'empty =',
      'gaps = a,,b,',
      'paths = x',
      'paths+ = y, z',
      'fresh + = q',
      'name = Grace',
      '',
    ].join('\n');
    expect(parseSettings(text)).toEqual({
      name: ['Grace'],
      tags: ['red', 'green', 'blue'],
      empty: [],
      gaps: ['a', '', 'b', ''],
      paths: ['x', 'y', 'z'],
      fresh: ['q'],
    });
  });

  it('keeps a quote that does not open an item as an ordinary character', () => {
    expect(parseSettings('a = say "hi", it\'s, 5" tall,x"')).toEqual({
      a: ['say "hi"', "it's", '5" tall', 'x"'],
    });
  });

  it('does not treat an include line specially', () => {
    expect(parseSettings('include = base\nx = 1')).toEqual({ include: ['base'], x: ['1'] });
  });

  it('throws the same errors as before', () => {
    expect(() => parseSettings('a = 1\nbroken')).toThrow('Line 2: expected key=value');
    expect(() => parseSettings('= 1')).toThrow('Line 1: missing key');
    expect(() => parseSettings('# c\n\n+ = 1')).toThrow('Line 3: missing key');
    expect(() => parseSettings('a b = 1')).toThrow('Line 1: invalid key a b');
    expect(() => parseSettings('ok = 1\nbad$ = 1')).toThrow('Line 2: invalid key bad$');
  });
});

describe('quoted values', () => {
  it('keeps commas and spaces inside quotes', () => {
    expect(parseSettings('names = "Lovelace, Ada", " Grace ", plain')).toEqual({
      names: ['Lovelace, Ada', ' Grace ', 'plain'],
    });
  });

  it('reads a quoted value that is the whole list', () => {
    expect(parseSettings('title = "  Mr. Smith, Jr.  "')).toEqual({
      title: ['  Mr. Smith, Jr.  '],
    });
  });

  it('reads escaped quotes and backslashes', () => {
    expect(parseSettings('a = "say \\"hi\\""\nb = "c:\\\\dir\\\\"\nc = "\\"", "\\\\"')).toEqual({
      a: ['say "hi"'],
      b: ['c:\\dir\\'],
      c: ['"', '\\'],
    });
  });

  it('keeps a backslash and its character when the character is not a quote or backslash', () => {
    expect(parseSettings('a = "x\\ny\\,z"')).toEqual({ a: ['x\\ny\\,z'] });
  });

  it('ignores spaces around quoted items', () => {
    expect(parseSettings('a =   "x"  ,   "y"   ,z , "w"')).toEqual({ a: ['x', 'y', 'z', 'w'] });
  });

  it('reads two quotes as an empty item, unlike an empty value', () => {
    expect(parseSettings('a = ""\nb =\nc = "", ""\nd = "x",')).toEqual({
      a: [''],
      b: [],
      c: ['', ''],
      d: ['x', ''],
    });
  });

  it('treats a quote after text as ordinary, even before a comma', () => {
    expect(parseSettings('a = x"y, z"')).toEqual({ a: ['x"y', 'z"'] });
  });

  it('works with the append form', () => {
    expect(parseSettings('p = a\np+ = "b, c", d')).toEqual({ p: ['a', 'b, c', 'd'] });
  });

  it('keeps an equals sign and a hash inside quotes', () => {
    expect(parseSettings('a = "k=v", "#x"')).toEqual({ a: ['k=v', '#x'] });
  });

  it('rejects text after a closing quote', () => {
    expect(() => parseSettings('a = 1\nb = "x" y')).toThrow(
      'Line 2: unexpected text after closing quote',
    );
    expect(() => parseSettings('b = "x""y"')).toThrow(
      'Line 1: unexpected text after closing quote',
    );
    expect(() => parseSettings('b = "x" "y"')).toThrow(
      'Line 1: unexpected text after closing quote',
    );
  });

  it('rejects a quote that is never closed', () => {
    expect(() => parseSettings('a = "x, y')).toThrow('Line 1: unterminated quote');
    expect(() => parseSettings('ok = 1\n\na = x, "y\\"')).toThrow('Line 3: unterminated quote');
    expect(() => parseSettings('a = "y\\')).toThrow('Line 1: unterminated quote');
    expect(() => parseSettings('a = "')).toThrow('Line 1: unterminated quote');
  });
});

describe('resolveSettings', () => {
  it('resolves a source without includes like parseSettings', () => {
    const text = 'a = 1\nb = "x, y"\n# c\nb+ = z';
    expect(resolveSettings('main', sources({ main: text }))).toEqual({
      kind: 'resolved',
      settings: parseSettings(text),
    });
  });

  it('puts the lines of an included source where the include line is', () => {
    const result = resolveSettings(
      'main',
      sources({
        main: 'name = Ada\n  include =  base  \nlang = fr',
        base: 'lang = en\ncolor = red\nname = Nobody',
      }),
    );
    expect(result).toEqual({
      kind: 'resolved',
      settings: { name: ['Nobody'], lang: ['fr'], color: ['red'] },
    });
  });

  it('lets lines after an include append to its lists and an include append to earlier ones', () => {
    const result = resolveSettings(
      'main',
      sources({ main: 'p = 1\ninclude=more\np+ = 4', more: 'p+ = 2, 3' }),
    );
    expect(result).toEqual({ kind: 'resolved', settings: { p: ['1', '2', '3', '4'] } });
  });

  it('follows includes of includes in order, including a source included twice', () => {
    const result = resolveSettings(
      'a',
      sources({
        a: 'include=b\ninclude=c\nx+ = a',
        b: 'include=d\nx+ = b',
        c: 'include=d\nx+ = c',
        d: 'x+ = d',
      }),
    );
    expect(result).toEqual({ kind: 'resolved', settings: { x: ['d', 'b', 'd', 'c', 'a'] } });
    expect(
      resolveSettings('a', sources({ a: 'include=b\ninclude=b\nx+ = a', b: 'x+ = b' })),
    ).toEqual({ kind: 'resolved', settings: { x: ['b', 'b', 'a'] } });
  });

  it('only treats a line whose key is exactly include as a directive', () => {
    const result = resolveSettings(
      'main',
      sources({
        main: '# include=base\ninclude2 = base\nnote = include=base\nInclude = base',
        base: 'x = 1',
      }),
    );
    expect(result).toEqual({
      kind: 'resolved',
      settings: { include2: ['base'], note: ['include=base'], Include: ['base'] },
    });
  });

  it('reads quoted values from every source', () => {
    const result = resolveSettings(
      'main',
      sources({ main: 'include=base\nown = "p, q"', base: 'names = "a, b", c' }),
    );
    expect(result).toEqual({
      kind: 'resolved',
      settings: { names: ['a, b', 'c'], own: ['p, q'] },
    });
  });

  it('reports a missing entry or a missing included source', () => {
    expect(resolveSettings('main', sources({}))).toEqual({ kind: 'missing-source', name: 'main' });
    expect(resolveSettings('main', sources({ main: 'include = base' }))).toEqual({
      kind: 'missing-source',
      name: 'base',
    });
    expect(
      resolveSettings('main', sources({ main: 'include = base', base: 'include = constructor' })),
    ).toEqual({ kind: 'missing-source', name: 'constructor' });
  });

  it('reports an include without a name, naming the source that holds it', () => {
    expect(resolveSettings('main', sources({ main: 'x = 1\ninclude =  ' }))).toEqual({
      kind: 'empty-include',
      source: 'main',
    });
    expect(
      resolveSettings('main', sources({ main: 'include = base', base: 'include=' })),
    ).toEqual({ kind: 'empty-include', source: 'base' });
  });

  it('reports an include cycle with the chain from the entry', () => {
    expect(resolveSettings('a', sources({ a: 'include = a' }))).toEqual({
      kind: 'include-cycle',
      chain: ['a', 'a'],
    });
    expect(resolveSettings('a', sources({ a: 'include = b', b: 'include = a' }))).toEqual({
      kind: 'include-cycle',
      chain: ['a', 'b', 'a'],
    });
    expect(
      resolveSettings('a', sources({ a: 'include=b', b: 'x = 1\ninclude=c', c: 'include=b' })),
    ).toEqual({ kind: 'include-cycle', chain: ['a', 'b', 'c', 'b'] });
  });

  it('does not call a repeated include a cycle', () => {
    const result = resolveSettings(
      'a',
      sources({ a: 'include=b\ninclude=c', b: 'include=c\nx = b', c: 'x = c' }),
    );
    expect(result).toEqual({ kind: 'resolved', settings: { x: ['c'] } });
  });

  it('throws what parseSettings throws for the expanded text', () => {
    expect(() =>
      resolveSettings('main', sources({ main: 'a = 1\ninclude=base\nz = 3', base: 'oops' })),
    ).toThrow('Line 2: expected key=value');
    expect(() =>
      resolveSettings('main', sources({ main: 'include=base', base: 'a = "x' })),
    ).toThrow('Line 1: unterminated quote');
  });
});
