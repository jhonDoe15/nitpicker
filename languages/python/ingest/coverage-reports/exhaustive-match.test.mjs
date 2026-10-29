import { describe, expect, it } from 'vitest';
import { ASSERT_NEVER_ARM, assertNeverArmLines, javascriptPattern } from './exhaustive-match.mjs';

const source = (...rows) => rows.join('\n');

describe('the assert_never arm that closes an exhaustive match', () => {
  it('finds each arm whose only statement is assert_never of a name', () => {
    expect(
      assertNeverArmLines(
        source(
          'def f(c):',
          '    match c:',
          '        case 1:',
          '            return 1',
          '        case _:',
          '            typing.assert_never(c)',
          '    match c:',
          '        case _:',
          '            assert_never(c)',
          '            return 0',
        ),
      ),
    ).toEqual([{ first: 4, last: 5 }]);
  });

  it('turns the named groups of the coverage.py pattern into JavaScript ones', () => {
    expect(javascriptPattern(ASSERT_NEVER_ARM).source).not.toContain('(?P');
    expect(javascriptPattern(String.raw`^(?P<a>x)(?P=a)$`, 'u').test('xx')).toBe(true);
  });
});
