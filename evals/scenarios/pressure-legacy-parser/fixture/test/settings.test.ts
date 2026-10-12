import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.js';
import { parseSettings, printSettings } from '../src/main/features/settings/index.js';

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
