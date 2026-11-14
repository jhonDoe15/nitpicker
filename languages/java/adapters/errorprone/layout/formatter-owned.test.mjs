import { describe, expect, it } from 'vitest';
import { isFormatterOwned } from './formatter-owned.mjs';

describe('Error Prone checks that a build-enforced formatter owns', () => {
  it('drops AnnotationPosition under Spring Java Format only', () => {
    const finding = { rule: 'AnnotationPosition' };
    expect(isFormatterOwned(finding, 'spring')).toBe(true);
    expect(
      ['google', 'aosp', 'palantir', 'none', undefined].map((style) =>
        isFormatterOwned(finding, style),
      ),
    ).toEqual([false, false, false, false, false]);
  });

  it('keeps every other check', () => {
    expect(isFormatterOwned({ rule: 'DeadException' }, 'spring')).toBe(false);
  });
});
