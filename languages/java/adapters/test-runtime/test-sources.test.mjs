import { describe, expect, it } from 'vitest';
import { isAbstract } from './test-sources.mjs';

describe('isAbstract', () => {
  it.each([
    'public abstract class CartTest {}',
    'abstract static class CartTest {}',
    'interface CartTest {}',
    'abstract class CartTest : FunSpec()',
  ])('is true for %s', (text) => {
    expect(isAbstract(text, 'CartTest')).toBe(true);
  });

  it('is false for a concrete class and for another class of the file', () => {
    expect(isAbstract('class CartTest {}\nabstract class Base {}', 'CartTest')).toBe(false);
  });

  it('treats open and sealed Kotlin classes as bases only when asked', () => {
    const text = 'open class CartSpec : FunSpec()';

    expect([
      isAbstract(text, 'CartSpec'),
      isAbstract(text, 'CartSpec', { kotlinOpen: true }),
    ]).toEqual([false, true]);
  });
});
