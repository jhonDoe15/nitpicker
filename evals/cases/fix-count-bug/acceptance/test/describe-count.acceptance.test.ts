import { describe, expect, it } from 'vitest';
import { describeCount } from '../src/main/features/greeting/index.js';

describe('describeCount', () => {
  it('uses the singular for one', () => {
    expect(describeCount(1)).toBe('1 name');
  });

  it('keeps the plural for other counts', () => {
    expect(describeCount(0)).toBe('0 names');
    expect(describeCount(2)).toBe('2 names');
    expect(describeCount(11)).toBe('11 names');
  });
});
