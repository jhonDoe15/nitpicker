import { describe, expect, it } from 'vitest';
import { definedFunctions, testMethods } from './test-methods.mjs';

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

describe('disabled tests', () => {
  it('skips tests marked @Disabled or @Ignore, before or after @Test', () => {
    const java = [
      'class T {',
      '  @Disabled("later")',
      '  @Test',
      '  void skippedFirst() { run(); }',
      '  @Test',
      '  @org.junit.jupiter.api.Disabled',
      '  void skippedAfter() { run(); }',
      '  @Test',
      '  void kept() { run(); }',
      '}',
    ].join('\n');
    const kotlin = [
      'class T {',
      '  @Ignore @Test fun skipped() { run() }',
      '  @Test @Ignore("flaky") fun skippedToo() { run() }',
      '  @Test fun kept() { run() }',
      '}',
    ].join('\n');

    expect(testMethods(java, 'java').map(({ name }) => name)).toEqual(['kept']);
    expect(testMethods(kotlin, 'kotlin').map(({ name }) => name)).toEqual(['kept']);
  });
});

describe('definedFunctions', () => {
  it('lists Java methods with bodies, not control statements, calls or constructors with new', () => {
    const text = [
      'class H {',
      '  static void assertOk(Result r) throws Exception {',
      '    if (r.failed()) { throw new AssertionError("x"); }',
      '  }',
      '  <T> T pick(List<T> items) { return items.get(0); }',
      '  void use() { run(new Foo() { void inner() { } }); }',
      '}',
    ].join('\n');

    expect(definedFunctions(text, 'java').map(({ name }) => name)).toEqual([
      'assertOk',
      'pick',
      'use',
      'inner',
    ]);
  });

  it('lists Kotlin functions with block and expression bodies', () => {
    const text = [
      'fun assertOk(r: Result) { if (r.failed) throw AssertionError("x") }',
      'private fun <T> pick(items: List<T>): T = items.first()',
      'fun String.shouldLookOk() = assertTrue(isNotEmpty())',
    ].join('\n');

    expect(definedFunctions(text, 'kotlin').map(({ name }) => name)).toEqual([
      'assertOk',
      'pick',
      'shouldLookOk',
    ]);
  });
});
