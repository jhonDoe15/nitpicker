import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { testClassesWithoutTests, testHelpersInSource } from './tests.mjs';

function found(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [
    reported.rule,
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

const IMPORT = 'import org.junit.jupiter.api.Test\n\n';

describe('testClassesWithoutTests', () => {
  it('flags a test class with no test in it', () => {
    expect(
      found(testClassesWithoutTests, `${IMPORT}class OrderTest {\n    fun setUp() {}\n}\n`),
    ).toEqual([['TestClassWithoutTestCases', 3, 'OrderTest']]);
  });

  it('flags a test-named function that lacks @Test next to ones that have it', () => {
    const source = `${IMPORT}class OrderTest {\n    @Test\n    fun totals() {}\n\n    fun \`rounds the total\`() {}\n\n    fun testRefund() {}\n\n    private fun order() = 1\n\n    fun shouldBeHelper(x: Int) = x\n\n    fun testVoid(): Unit {\n    }\n}\n`;

    expect(found(testClassesWithoutTests, source)).toEqual([
      ['DetachedTestCase', 7, '`rounds the total`'],
      ['DetachedTestCase', 9, 'testRefund'],
      ['DetachedTestCase', 15, 'testVoid'],
    ]);
  });

  it('passes test-named helpers and data providers that return a value', () => {
    const source = [
      IMPORT,
      'class PriceTest {',
      '    fun testCases(): List<Int> = listOf(1, 2)',
      '',
      '    fun testOrder(): Order = Order(1)',
      '',
      '    fun shouldRound(): Boolean {',
      '        return true',
      '    }',
      '',
      '    fun `sample order`() = Order(2)',
      '',
      '    @ParameterizedTest',
      '    @MethodSource("testCases")',
      '    fun prices(n: Int) { assertEquals(n, testOrder().id) }',
      '}',
    ].join('\n');

    expect(found(testClassesWithoutTests, source)).toEqual([]);
  });

  it.each([
    ['annotated tests', `${IMPORT}class OrderTest {\n    @Test\n    fun \`totals\`() {}\n}\n`],
    [
      'parameterized tests',
      'class OrderTest {\n    @ParameterizedTest\n    @ValueSource(ints = [1])\n    fun totals(x: Int) {}\n}\n',
    ],
    [
      'nested tests',
      'class OrderTest {\n    @Nested\n    inner class Refunds {\n        @Test fun works() {}\n    }\n}\n',
    ],
    ['an abstract base', 'abstract class OrderTest {\n    fun helper() {}\n}\n'],
    ['an open base', 'open class OrderTest {\n    fun helper() {}\n}\n'],
    ['a Kotest spec', 'class OrderTest : FunSpec({\n    test("totals") {}\n})\n'],
    ['a class that inherits its tests', 'class OrderIT : ContractTest() {\n}\n'],
    ['a suite', '@Suite\n@SelectClasses(OrderTest::class)\nclass AllTests {\n}\n'],
    ['a class that is not a test class', 'class OrderFixtures {\n    fun order() = 1\n}\n'],
  ])('passes %s', (_name, source) => {
    expect(found(testClassesWithoutTests, source)).toEqual([]);
  });
});

describe('testHelpersInSource', () => {
  it.each([
    'import org.junit.jupiter.api.Assertions',
    'import kotlin.test.assertEquals',
    'import io.mockk.mockk',
    'import org.mockito.Mockito',
    'import org.assertj.core.api.Assertions.assertThat',
  ])('flags %s in production sources', (line) => {
    expect(found(testHelpersInSource, `package demo\n\n${line}\n`)).toEqual([
      ['TestHelperInSource', 3, line],
    ]);
  });

  it('passes production imports and a test import in a comment', () => {
    expect(
      found(
        testHelpersInSource,
        'package demo\n\nimport kotlin.math.max\n// import org.junit.Test\n',
      ),
    ).toEqual([]);
  });
});
