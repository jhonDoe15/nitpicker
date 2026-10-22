import { describe, expect, it } from 'vitest';
import { templateMethods, testMethod } from './test-methods.mjs';
import { ADDS_SPEC, ORDER_SOURCE } from './test-support/test-sources.mjs';

describe('testMethod', () => {
  it('finds a method by its call name, its Surefire name or its display name, with its annotations', () => {
    const named = `class A {\n  @Test\n  @DisplayName("adds \\"two\\"")\n  void adds() { if (x) { y(); } }\n}\n`;

    expect(testMethod(ORDER_SOURCE, 'positive(int)[1]')).toEqual({
      line: 11,
      text: '@ParameterizedTest\n@ValueSource(ints = {1, 2})\nvoid positive(int value) {\nassertTrue(value > 0);\n}',
    });
    expect(testMethod(ORDER_SOURCE, 'totals')?.line).toBe(5);
    expect(testMethod(named, 'adds "two"')?.line).toBe(4);
    expect(testMethod(ORDER_SOURCE, '[1] 1')).toBeUndefined();
  });

  it('finds a JUnit 4 parameterized case and a @TestFactory that returns dynamic tests', () => {
    const source = `class A {
  @Test
  public void adds() {}

  @TestFactory
  Stream<DynamicTest> grows() {
    return Stream.of();
  }

  @TestFactory
  DynamicTest[] shrinks() {
    return new DynamicTest[0];
  }
}
`;

    expect(
      ['adds[0]', 'grows()', 'grows()[1]', 'shrinks()'].map(
        (name) => testMethod(source, name)?.line,
      ),
    ).toEqual([3, 6, 6, 11]);
  });

  it('looks for a @Nested test inside its own class, and an outer test outside nested ones', () => {
    const source = `class CalcTest {
  @Nested
  class WhenEmpty {
    @Test
    void returnsZero() {}
  }

  @Nested
  class WhenFull {
    @Test
    void returnsZero() {}
  }

  @Test
  void returnsZero() {}
}
`;

    expect(
      ['CalcTest$WhenEmpty', 'CalcTest$WhenFull', 'CalcTest', 'CalcTest$Missing'].map(
        (className) => testMethod(source, 'returnsZero()', className)?.line,
      ),
    ).toEqual([5, 11, 15, undefined]);
  });

  it('finds a Kotlin test named with backticks', () => {
    const kotlin = 'class KTest {\n  @Test\n  fun `ships an order`() {\n    check(true)\n  }\n}\n';

    expect(testMethod(kotlin, 'ships an order()')?.line).toBe(3);
  });

  it('finds a Spock feature named with a double- or single-quoted string', () => {
    const spock = `class OrderSpec extends Specification {
  def "ships an order"() {
    expect: true
  }

  def 'cancels an order'() {
    expect: true
  }
}
`;

    expect(['ships an order', 'cancels an order'].map((name) => testMethod(spock, name))).toEqual([
      { line: 2, text: 'def "ships an order"() {\nexpect: true\n}' },
      { line: 6, text: "def 'cancels an order'() {\nexpect: true\n}" },
    ]);
  });
});

describe('Spock unrolled features', () => {
  it('matches an iteration to its feature by placeholders or the default iteration suffix', () => {
    expect(
      ['adds 1 and 2', 'max [a: 1, b: 2, c: 2, #0]', 'adds #a and #b [a: 1, b: 2, #0]'].map(
        (name) => testMethod(ADDS_SPEC, name)?.line,
      ),
    ).toEqual([4, 13, 4]);
  });

  it('matches no helper and no Java method to an unrolled name', () => {
    const java = 'class AddsTest {\n  @Test\n  void max() {}\n}\n';

    expect([
      testMethod(ADDS_SPEC, 'helper 1'),
      testMethod(ADDS_SPEC, 'subtracts 1 and 2'),
      testMethod(java, 'max [a: 1, #0]'),
    ]).toEqual([undefined, undefined, undefined]);
  });

  it('treats features with a where: block as templates, and no helper or Java label', () => {
    const java =
      'class Scan {\n  void scan() {\n    where:\n    for (;;) { break where; }\n  }\n}\n';

    expect(templateMethods(ADDS_SPEC, 'shop.AddsSpec')).toBe(
      [
        'def "adds #a and #b"() {',
        'expect:',
        'a + b == c',
        'where:',
        'a | b | c',
        '1 | 2 | 3',
        '}',
        'def "max"() {',
        'expect:',
        'Math.max(a, b) == c',
        'where:',
        'a | b | c',
        '1 | 2 | 2',
        '}',
      ].join('\n'),
    );
    expect(templateMethods(java, 'Scan')).toBe('');
  });
});
