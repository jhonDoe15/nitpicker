import { describe, expect, it } from 'vitest';
import { parseIni } from './ini-file.mjs';

describe('parsing an ini file', () => {
  it('reads sections, both separators, comments and continued values', () => {
    const sections = parseIni(
      [
        '# note',
        '[one]',
        'a = 1',
        'b: two',
        '; skipped',
        'c =',
        '  x',
        '  y',
        '',
        '[two]',
        'd=4',
      ].join('\n'),
    );

    expect([...sections.keys()]).toEqual(['one', 'two']);
    expect(Object.fromEntries(sections.get('one') ?? [])).toEqual({ a: '1', b: 'two', c: 'x\ny' });
    expect(Object.fromEntries(sections.get('two') ?? [])).toEqual({ d: '4' });
  });

  it('ignores options before the first section', () => {
    expect(parseIni('a = 1\n[s]\nb = 2').get('s')?.get('b')).toBe('2');
    expect(parseIni('a = 1').size).toBe(0);
  });

  it('keeps an option without a value empty', () => {
    expect(parseIni('[s]\nflag').get('s')?.get('flag')).toBe('');
  });
});
