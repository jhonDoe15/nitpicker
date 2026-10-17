import { describe, expect, it } from 'vitest';
import { calledNames, hasAssertion, isHelperName, terminalCall } from './assertions.mjs';

describe('hasAssertion', () => {
  it.each([
    ['a JUnit assertion', 'assertEquals(1, x);', 'java', true],
    ['a Mockito verification', 'verify(mock).run();', 'java', true],
    ['a plain call', 'service.run();', 'java', false],
    ['an assertion name only mentioned as a value', 'var assertion = 1;', 'java', false],
    ['a kotlin.test assertion', 'assertTrue(x)', 'kotlin', true],
    ['a Kotest matcher', 'result shouldBe 3', 'kotlin', true],
    ['a MockK verification', 'coVerify { repo.save(any()) }', 'kotlin', true],
    ['a Kotlin test that only calls', 'service.run()', 'kotlin', false],
    ['a variable named like an assertion', 'val expected = 3\nuse(expected)', 'kotlin', false],
    [
      'a variable named expectedValue',
      'val expectedValue = 3\nuse(expectedValue)',
      'kotlin',
      false,
    ],
    [
      'a call on a receiver that starts like an assertion',
      'checkoutService.run()',
      'kotlin',
      false,
    ],
    ['a Java call on a receiver that starts like a check', 'checkoutService.run();', 'java', false],
    [
      'an assertion that ends in a capital',
      'assertFailsWith<IOException> { read() }',
      'kotlin',
      true,
    ],
    ['a Kotest should matcher call', 'shouldThrow<IOException> { read() }', 'kotlin', true],
    ['a Strikt expectThat', 'expectThat(x).isEqualTo(1)', 'kotlin', true],
    ['a name that only starts with verify', 'verifyingStuff(x);', 'java', false],
    ['a variable named should', 'val shouldRetry = true\nuse(shouldRetry)', 'kotlin', false],
  ])('%s', (_name, body, language, expected) => {
    expect(hasAssertion({ body, language })).toBe(expected);
  });

  it('accepts the project helpers given as extra names', () => {
    expect(hasAssertion({ body: 'expectOk(r);', language: 'java', extra: ['expectOk'] })).toBe(
      true,
    );
    expect(hasAssertion({ body: 'expectOk(r);', language: 'java' })).toBe(false);
  });
});

describe('terminalCall', () => {
  it('names the call that ends the last Java statement, not the nested ones', () => {
    expect(terminalCall('a(); helper(wrap(x)).check(y);', 'java')).toBe('check');
    expect(terminalCall('a(); expectOk(r);', 'java')).toBe('expectOk');
    expect(terminalCall('', 'java')).toBeUndefined();
  });

  it('names the call that ends the last Kotlin statement', () => {
    expect(terminalCall('\n    setup()\n    expectOk(r)\n  ', 'kotlin')).toBe('expectOk');
    expect(terminalCall('\n    first()\n    client.get()\n      .expectOk()\n', 'kotlin')).toBe(
      'expectOk',
    );
  });
});

describe('names', () => {
  it('lists called names, with generics and infix calls in Kotlin', () => {
    expect(calledNames('a(1); b.c { d }')).toEqual(['a', 'c']);
    expect(calledNames('x shouldBe 3', 'kotlin')).toEqual(['shouldBe']);
    expect(calledNames('f<T>(a) { g }', 'kotlin')).toEqual(['f']);
  });

  it('recognises assertion vocabulary', () => {
    expect([isHelperName('expectOk'), isHelperName('isValid'), isHelperName('run')]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
