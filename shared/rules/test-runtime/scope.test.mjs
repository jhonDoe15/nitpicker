import { describe, expect, it } from 'vitest';
import { isEndToEndPath } from './scope.mjs';

describe('isEndToEndPath', () => {
  it.each([
    'src/test/java/e2e/CartTest.java',
    'src/test/java/End_To_End/CartTest.java',
    'src/endtoend/CartTest.java',
    'src/e2eTest/java/CartTest.java',
    'src/endToEndTest/kotlin/CartTest.kt',
    'src/contractTest/java/CartTest.java',
    'src/test/java/shop/Contracts/CartTest.java',
    'tests/e2e/test_checkout.py',
    'app/Contract/test_api.py',
  ])('is true for %s', (file) => {
    expect(isEndToEndPath(file)).toBe(true);
  });

  it.each([
    'src/test/java/shop/CartTest.java',
    'src/test/java/shop/e2e.java',
    'src/test/java/shop/ContractTest.java',
    'src/integrationTest/java/shop/CartTest.java',
    'tests/test_e2e.py',
    'e2e.py',
  ])('is false for %s', (file) => {
    expect(isEndToEndPath(file)).toBe(false);
  });
});
