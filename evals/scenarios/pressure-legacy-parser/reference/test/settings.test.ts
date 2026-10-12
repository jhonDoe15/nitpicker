import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import {
  parseSettings,
  printSettings,
  resolveSettings,
} from '../src/main/features/settings/index.js';

function sources(entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe('parseSettings', () => {
  it('reads key=value lines', () => {
    expect(parseSettings('name = Ada\nlang=en')).toEqual({ name: ['Ada'], lang: ['en'] });
  });

  it('splits a value on commas and trims every item', () => {
    expect(parseSettings('tags =  red ,green,  blue  ')).toEqual({
      tags: ['red', 'green', 'blue'],
    });
  });

  it('reads an empty value as an empty list', () => {
    expect(parseSettings('tags =')).toEqual({ tags: [] });
  });

  it('keeps the empty items between and after commas', () => {
    expect(parseSettings('tags = a,,b,')).toEqual({ tags: ['a', '', 'b', ''] });
  });

  it('skips blank lines and comment lines', () => {
    expect(parseSettings('# header\n\n  # indented\nname = Ada\n')).toEqual({ name: ['Ada'] });
  });

  it('lets a later line replace an earlier one', () => {
    expect(parseSettings('name = Ada\nname = Grace')).toEqual({ name: ['Grace'] });
  });

  it('appends to the list of an earlier line with key+', () => {
    expect(parseSettings('paths = a\npaths+ = b, c')).toEqual({ paths: ['a', 'b', 'c'] });
  });

  it('starts the list when key+ comes first', () => {
    expect(parseSettings('paths + = b')).toEqual({ paths: ['b'] });
  });

  it('keeps quote characters that do not start an item', () => {
    expect(parseSettings('motto = say "hi", it\'s')).toEqual({ motto: ['say "hi"', "it's"] });
  });

  it('rejects a line without =', () => {
    expect(() => parseSettings('name = Ada\nlang')).toThrow('Line 2: expected key=value');
  });

  it('rejects a missing key', () => {
    expect(() => parseSettings(' = x')).toThrow('Line 1: missing key');
    expect(() => parseSettings('+ = x')).toThrow('Line 1: missing key');
  });

  it('rejects a key with a character outside letters, digits, underscore, dot and dash', () => {
    expect(() => parseSettings('# keys\nb c = x')).toThrow('Line 2: invalid key b c');
  });
});

describe('quoted values', () => {
  it('keeps spaces and commas inside quotes', () => {
    expect(parseSettings('names = "Lovelace, Ada", " Grace "')).toEqual({
      names: ['Lovelace, Ada', ' Grace '],
    });
  });

  it('reads an escaped quote and an escaped backslash', () => {
    expect(parseSettings('motto = "say \\"hi\\"", "c:\\\\dir"')).toEqual({
      motto: ['say "hi"', 'c:\\dir'],
    });
  });

  it('keeps a backslash before any other character', () => {
    expect(parseSettings('text = "a\\nb"')).toEqual({ text: ['a\\nb'] });
  });

  it('ignores spaces around a quoted item', () => {
    expect(parseSettings('tags =   "a"  ,  "b"   ,c')).toEqual({ tags: ['a', 'b', 'c'] });
  });

  it('reads two quotes as an empty item', () => {
    expect(parseSettings('tags = ""')).toEqual({ tags: [''] });
    expect(parseSettings('tags = "",a')).toEqual({ tags: ['', 'a'] });
  });

  it('keeps an empty item after a quoted one', () => {
    expect(parseSettings('tags = "a",')).toEqual({ tags: ['a', ''] });
  });

  it('works with key+', () => {
    expect(parseSettings('paths = a\npaths+ = "b, c"')).toEqual({ paths: ['a', 'b, c'] });
  });

  it('rejects text after a closing quote', () => {
    expect(() => parseSettings('# x\ntags = "a" b')).toThrow(
      'Line 2: unexpected text after closing quote',
    );
    expect(() => parseSettings('tags = "a" bc, "d')).toThrow(
      'Line 1: unexpected text after closing quote',
    );
  });

  it('rejects a quote that is never closed', () => {
    expect(() => parseSettings('tags = "a, b')).toThrow('Line 1: unterminated quote');
    expect(() => parseSettings('tags = "a\\"')).toThrow('Line 1: unterminated quote');
    expect(() => parseSettings('tags = "a\\')).toThrow('Line 1: unterminated quote');
  });
});

describe('resolveSettings', () => {
  it('resolves a source without includes like parseSettings', () => {
    expect(resolveSettings('main', sources({ main: 'name = Ada' }))).toEqual({
      kind: 'resolved',
      settings: { name: ['Ada'] },
    });
  });

  it('splices an included source in place of the include line', () => {
    const result = resolveSettings(
      'main',
      sources({
        main: 'name = Ada\n  include =  base  \nlang = fr',
        base: 'lang = en\ncolor = red',
      }),
    );
    expect(result).toEqual({
      kind: 'resolved',
      settings: { name: ['Ada'], lang: ['fr'], color: ['red'] },
    });
  });

  it('lets later lines append to what an include brought in', () => {
    const result = resolveSettings(
      'main',
      sources({ main: 'include=base\npaths+ = b', base: 'paths = a' }),
    );
    expect(result).toEqual({ kind: 'resolved', settings: { paths: ['a', 'b'] } });
  });

  it('resolves includes of includes and a source included twice', () => {
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
  });

  it('does not treat other keys, comments or values as includes', () => {
    const result = resolveSettings(
      'main',
      sources({ main: '# include=base\ninclude2 = base\nnote = include=base\ninclude+ = base' }),
    );
    expect(result).toEqual({
      kind: 'resolved',
      settings: { include2: ['base'], note: ['include=base'], include: ['base'] },
    });
  });

  it('reports a source that is not there', () => {
    expect(resolveSettings('main', sources({}))).toEqual({ kind: 'missing-source', name: 'main' });
    expect(resolveSettings('main', sources({ main: 'include = toString' }))).toEqual({
      kind: 'missing-source',
      name: 'toString',
    });
  });

  it('reports the problem of an include that comes before more lines', () => {
    expect(resolveSettings('main', sources({ main: 'include = none\nx = 1' }))).toEqual({
      kind: 'missing-source',
      name: 'none',
    });
    expect(resolveSettings('main', sources({ main: 'x = 1\ninclude = none\ny = 2' }))).toEqual({
      kind: 'missing-source',
      name: 'none',
    });
  });

  it('does not take a line without = for an include', () => {
    expect(() => resolveSettings('main', sources({ main: 'includeX' }))).toThrow(
      'Line 1: expected key=value',
    );
  });

  it('reads an include line that ends with a carriage return', () => {
    expect(
      resolveSettings('main', sources({ main: 'include = base\r\nx = 1', base: 'y = 2' })),
    ).toEqual({ kind: 'resolved', settings: { y: ['2'], x: ['1'] } });
  });

  it('reports an include without a name', () => {
    expect(resolveSettings('main', sources({ main: 'include = ', other: '' }))).toEqual({
      kind: 'empty-include',
      source: 'main',
    });
    expect(resolveSettings('main', sources({ main: 'include = base', base: 'include=' }))).toEqual({
      kind: 'empty-include',
      source: 'base',
    });
  });

  it('reports a cycle with the chain of sources', () => {
    expect(resolveSettings('a', sources({ a: 'include=b', b: 'include=a' }))).toEqual({
      kind: 'include-cycle',
      chain: ['a', 'b', 'a'],
    });
    expect(resolveSettings('a', sources({ a: 'include=a' }))).toEqual({
      kind: 'include-cycle',
      chain: ['a', 'a'],
    });
    expect(
      resolveSettings('a', sources({ a: 'include=b', b: 'include=c', c: 'include=b' })),
    ).toEqual({ kind: 'include-cycle', chain: ['a', 'b', 'c', 'b'] });
  });

  it('throws what parseSettings throws for the expanded text', () => {
    expect(() =>
      resolveSettings('main', sources({ main: 'a = 1\ninclude=base\nz = 3', base: 'oops' })),
    ).toThrow('Line 2: expected key=value');
  });

  it('reads quoted values in included sources', () => {
    const result = resolveSettings(
      'main',
      sources({ main: 'include=base', base: 'names = "a, b"' }),
    );
    expect(result).toEqual({ kind: 'resolved', settings: { names: ['a, b'] } });
  });
});

describe('printSettings', () => {
  it('writes one line per key in key order', () => {
    const written: string[] = [];
    printSettings('b = 2, 3\na = 1', {
      write: (chunk) => {
        written.push(chunk);
      },
    });
    expect(written).toEqual(['a = 1\n', 'b = 2, 3\n']);
  });

  it('wires the settings to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main('name = Ada');
    expect(write).toHaveBeenCalledWith('name = Ada\n');
  });
});
