import { describe, expect, it } from 'vitest';
import { jscpdClones } from './jscpd-clones.mjs';

const report = {
  duplicates: [
    {
      firstFile: { name: 'app/a.py', start: 3 },
      secondFile: { name: './app/b.py', start: 9 },
      fragment: 'x = 1',
      lines: 6,
      tokens: 51,
    },
  ],
};

function files(clones) {
  return clones.map(({ first, second }) => [first.file, second.file]);
}

describe('jscpd clones', () => {
  it('prefixes the names with the single configured root', () => {
    expect(files(jscpdClones(report, ['src/']))).toEqual([['src/app/a.py', 'src/app/b.py']]);
  });

  it('keeps a name that already starts with the root', () => {
    const rooted = {
      duplicates: [{ firstFile: { name: 'src/a.py' }, secondFile: { name: 'src' } }],
    };

    expect(files(jscpdClones(rooted, ['src']))).toEqual([['src/a.py', 'src']]);
  });

  it('adds no prefix for the project root or several roots', () => {
    for (const configured of [['.'], ['./'], ['a', 'b'], undefined]) {
      expect(jscpdClones(report, configured)[0].second.file).toBe('app/b.py');
    }
  });

  it('carries the size and the cloned text', () => {
    expect(jscpdClones(report, ['.'])[0]).toEqual({
      first: { file: 'app/a.py', line: 3 },
      second: { file: 'app/b.py', line: 9 },
      fragment: 'x = 1',
      lines: 6,
      tokens: 51,
    });
  });

  it('rejects a clone without a file name', () => {
    expect(() => jscpdClones({ duplicates: [{ firstFile: {} }] }, [])).toThrow(
      'Duplicate report contains an invalid file name',
    );
  });
});
