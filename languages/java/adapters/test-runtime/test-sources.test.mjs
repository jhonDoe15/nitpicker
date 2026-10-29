import { describe, expect, it } from 'vitest';
import { isAbstract, isEndToEndPath } from './test-sources.mjs';

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

describe('isEndToEndPath', () => {
  it.each([
    'src/test/java/e2e/CartTest.java',
    'src/test/java/End_To_End/CartTest.java',
    'src/endtoend/CartTest.java',
    'src/e2eTest/java/CartTest.java',
    'src/endToEndTest/kotlin/CartTest.kt',
    'src/contractTest/java/CartTest.java',
    'src/test/java/shop/Contracts/CartTest.java',
  ])('is true for %s', (file) => {
    expect(isEndToEndPath(file)).toBe(true);
  });

  it.each([
    'src/test/java/shop/CartTest.java',
    'src/test/java/shop/e2e.java',
    'src/test/java/shop/ContractTest.java',
    'src/integrationTest/java/shop/CartTest.java',
  ])('is false for %s', (file) => {
    expect(isEndToEndPath(file)).toBe(false);
  });
});
