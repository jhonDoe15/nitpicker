import { describe, expect, it } from 'vitest';
import { describeCount } from '../src/main/features/greeting/index.js';

describe('describeCount', () => {
  it('names the empty count', () => {
    expect(describeCount(0)).toBe('no names');
  });

  it('keeps the other counts', () => {
    expect(describeCount(2)).toBe('2 names');
    expect(describeCount(11)).toBe('11 names');
  });
});
