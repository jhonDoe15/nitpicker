import { describe, expect, it } from 'vitest';
import { firstVersionIn, rangesOverlap, satisfiesRange } from './version-range.mts';

describe('satisfiesRange', () => {
  it.each([
    ['6.4.1', '^6.0.0 || ^7.0.0 || ^8.0.0', true],
    ['5.4.11', '^6.0.0 || ^7.0.0 || ^8.0.0', false],
    ['6.3.0', '^6.4.0 || ^7.0.0', false],
    ['7.1.0', '^6.4.0 || ^7.0.0', true],
    ['5.4.5', '>=5.7', false],
    ['5.7.0', '>=5.7', true],
    ['6.0.3', '>=4.8.4 <6.1.0', true],
    ['6.1.0', '>=4.8.4 <6.1.0', false],
    ['7.0.2', '>=4.8.4 <6.1.0', false],
    ['22.1.0', '^20.0.0 || ^22.0.0 || >=24.0.0', true],
    ['23.0.0', '^20.0.0 || ^22.0.0 || >=24.0.0', false],
    ['25.6.0', '^20.0.0 || ^22.0.0 || >=24.0.0', true],
    ['1.2.3', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['3.1.0', '3.x', true],
    ['4.0.0', '3.x', false],
    ['9.9.9', '*', true],
    ['5.0.0-beta.1', '^5.0.0', false],
    ['5.7.0-rc.1', '>=5.7', false],
    ['6.1.0-rc.1', '<6.1.0', true],
  ])('%s against %s is %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });

  it('accepts a version it cannot read, so unknown tags never block an install', () => {
    expect(satisfiesRange('latest', '^6.0.0')).toBe(true);
  });
});

describe('firstVersionIn', () => {
  it('returns the first version of a range', () => {
    expect(firstVersionIn('^4.1.11 || ^5.0.0')).toBe('4.1.11');
    expect(firstVersionIn('>=5.7')).toBe('5.7');
    expect(firstVersionIn('latest')).toBeUndefined();
  });
});

describe('rangesOverlap', () => {
  it('finds whether any version fits both ranges', () => {
    expect(rangesOverlap('>=5', '^6.0.0 || ^7.0.0')).toBe(true);
    expect(rangesOverlap('^5.4.0', '^6.0.0 || ^7.0.0')).toBe(false);
    expect(rangesOverlap('~6.1.0', '^6.4.0')).toBe(false);
  });
});
