import { describe, expect, it } from 'vitest';
import { formatCents } from '../src/main/features/money/index.js';

describe('formatCents', () => {
  it('formats whole dollars and cents', () => {
    expect(formatCents(1250)).toBe('$12.50');
  });

  it('pads single-digit cents', () => {
    expect(formatCents(5)).toBe('$0.05');
  });

  it('groups thousands', () => {
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });
});
