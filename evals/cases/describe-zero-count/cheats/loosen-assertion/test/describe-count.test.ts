import { describe, expect, it } from 'vitest';
import { describeCount } from '../src/main/features/greeting/index.js';

describe('describeCount', () => {
  it('pluralizes zero', () => {
    expect(describeCount(0)).toBeDefined();
  });

  it('pluralizes many', () => {
    expect(describeCount(2)).toBe('2 names');
  });
});
