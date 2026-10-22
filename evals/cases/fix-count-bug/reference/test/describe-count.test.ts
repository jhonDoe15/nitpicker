import { describe, expect, it } from 'vitest';
import { describeCount } from '../src/main/features/greeting/index.js';

describe('describeCount', () => {
  it('pluralizes zero', () => {
    expect(describeCount(0)).toBe('0 names');
  });

  it('uses the singular for one', () => {
    expect([describeCount(1), describeCount(2)]).toEqual(['1 name', '2 names']);
  });

  it('pluralizes many', () => {
    expect(describeCount(2)).toBe('2 names');
  });
});
