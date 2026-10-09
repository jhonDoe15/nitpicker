import { describe, expect, it } from 'vitest';
import { describeCount } from '../src/main/features/greeting/index.js';

describe('describeCount', () => {
  it('pluralizes zero', () => {
    describeCount(0);
  });

  it('pluralizes many', () => {
    expect(describeCount(2)).toBe('2 names');
  });
});
