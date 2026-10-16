import { describe, expect, it } from 'vitest';
import { testMethods } from './test-methods.mjs';

describe('testMethods in Java', () => {
  it('returns the name and body of every annotated test method', () => {
    const text = [
      'class AccountTest {',
      '  @Test',
      '  void adds() throws Exception {',
      '    assertEquals(2, add(1, 1));',
      '  }',
      '',
      '  void helper() {',
      '    work();',
      '  }',
      '',
      '  @ParameterizedTest(name = "{0}")',
      '  @ValueSource(ints = {1, 2})',
      '  public void parameterized(int value) {',
      '    verifyValid(value);',
      '  }',
      '}',
    ].join('\n');

    expect(testMethods(text, 'java')).toEqual([
      { name: 'adds', body: '\n    assertEquals(2, add(1, 1));\n  ' },
      { name: 'parameterized', body: '\n    verifyValid(value);\n  ' },
    ]);
  });

  it('skips tests that expect an exception and ignores comments and strings', () => {
    const text = [
      'class T {',
      '  @Test(expected = IOException.class)',
      '  void throwing() { read(); }',
      '  // @Test void commented() { }',
      '  String s = "@Test void quoted() { }";',
      '}',
    ].join('\n');

    expect(testMethods(text, 'java')).toEqual([]);
  });
});

describe('testMethods in Kotlin', () => {
  it('reads block bodies, backtick names and expression bodies', () => {
    const text = [
      'class AccountTest {',
      '  @Test',
      '  fun adds() {',
      '    assertEquals(2, add(1, 1))',
      '  }',
      '',
      '  @Test',
      '  fun `rejects a negative amount`() = runTest {',
      '    account.withdraw(-1)',
      '    verify(exactly = 1) { audit.log() }',
      '  }',
      '',
      '  @Test fun single() = check(true)',
      '}',
    ].join('\n');

    expect(testMethods(text, 'kotlin')).toEqual([
      { name: 'adds', body: '\n    assertEquals(2, add(1, 1))\n  ' },
      {
        name: 'rejects a negative amount',
        body: '\n    account.withdraw(-1)\n    verify(exactly = 1) { audit.log() }',
      },
      { name: 'single', body: ' check(true)' },
    ]);
  });
});
