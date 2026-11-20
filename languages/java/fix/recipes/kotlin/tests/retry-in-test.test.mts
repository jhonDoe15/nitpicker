import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { kotlinRetryInTestRecipe } from './retry-in-test.mts';

const TEST = 'src/test/kotlin/demo/ATest.kt';
const fix = (text: string): string => applyRecipe(kotlinRetryInTestRecipe, text, TEST);

describe('kotlinRetryInTestRecipe', () => {
  it('turns a Pioneer retry into a plain test and drops its import', () => {
    const text = [
      'package demo',
      '',
      'import org.junit.jupiter.api.Test',
      'import org.junitpioneer.jupiter.RetryingTest',
      '',
      'class ATest {',
      '    @RetryingTest(3)',
      '    fun flaky() { }',
      '',
      '    @Test',
      '    fun stable() { }',
      '}',
      '',
    ].join('\n');

    expect(fix(text)).toBe(
      [
        'package demo',
        '',
        'import org.junit.jupiter.api.Test',
        '',
        'class ATest {',
        '    @Test',
        '    fun flaky() { }',
        '',
        '    @Test',
        '    fun stable() { }',
        '}',
        '',
      ].join('\n'),
    );
    expect(plannedLines(kotlinRetryInTestRecipe, text, TEST)).toEqual([7]);
  });
  it('qualifies the replacement when Test is not imported and drops a duplicate annotation', () => {
    const text = [
      'package demo',
      '',
      'import io.github.artsok.RepeatedIfExceptionsTest',
      'import org.junit.jupiter.api.Test',
      '',
      'class ATest {',
      '    @RepeatedIfExceptionsTest(repeats = 2)',
      '    @Test',
      '    fun both() { }',
      '}',
      '',
    ].join('\n');

    expect(fix(text)).toBe(
      [
        'package demo',
        '',
        'import org.junit.jupiter.api.Test',
        '',
        'class ATest {',
        '    @Test',
        '    fun both() { }',
        '}',
        '',
      ].join('\n'),
    );
    const bare =
      'import org.junitpioneer.jupiter.RetryingTest\nclass ATest {\n    @RetryingTest(2)\n    fun a() { }\n}\n';

    expect(fix(bare)).toBe('class ATest {\n    @org.junit.jupiter.api.Test\n    fun a() { }\n}\n');
  });
  it('drops the retryAnalyzer argument of a TestNG test', () => {
    const text = [
      'import org.testng.annotations.Test',
      'class ATest {',
      '    @Test(retryAnalyzer = Again::class)',
      '    fun alone() { }',
      '',
      '    @Test(groups = ["fast"], retryAnalyzer = Again::class)',
      '    fun last() { }',
      '',
      '    @Test(retryAnalyzer = Again::class, enabled = true)',
      '    fun first() { }',
      '}',
      '',
    ].join('\n');

    expect(fix(text)).toBe(
      [
        'import org.testng.annotations.Test',
        'class ATest {',
        '    @Test',
        '    fun alone() { }',
        '',
        '    @Test(groups = ["fast"])',
        '    fun last() { }',
        '',
        '    @Test(enabled = true)',
        '    fun first() { }',
        '}',
        '',
      ].join('\n'),
    );
  });
  it('drops Kotest retries from specs, configs and constructors', () => {
    const head = [
      'import io.kotest.core.spec.style.FunSpec',
      'import io.kotest.core.test.config.TestConfig',
      'import io.kotest.core.config.AbstractProjectConfig',
      '',
    ];
    const text = [
      ...head,
      'class ASpec : FunSpec({',
      '    retries = 2',
      '    test("a").config(retries = 3) { }',
      '    test("b").config(retries = 2, retryDelay = 1.seconds) { }',
      '    test("c", TestConfig(retries = 1)) { }',
      '})',
      '',
      'object ProjectConfig : AbstractProjectConfig() {',
      '    override val retries: Int? = 2',
      '    override val retryDelay = null',
      '}',
      '',
    ].join('\n');

    expect(fix(text)).toBe(
      [
        ...head,
        'class ASpec : FunSpec({',
        '    test("a").config() { }',
        '    test("b").config(retryDelay = 1.seconds) { }',
        '    test("c", TestConfig()) { }',
        '})',
        '',
        'object ProjectConfig : AbstractProjectConfig() {',
        '    override val retryDelay = null',
        '}',
        '',
      ].join('\n'),
    );
  });
  it('leaves analyzers, grouped annotations, multi-line values and main sources alone', () => {
    const analyzer =
      'import org.testng.IRetryAnalyzer\nclass Again : IRetryAnalyzer {\n    override fun retry(result: ITestResult): Boolean = false\n}\n';
    const grouped =
      'import org.junitpioneer.jupiter.RetryingTest\nclass ATest {\n    @[RetryingTest(3) Test]\n    fun a() { }\n}\n';
    const multiline =
      'import io.kotest.core.spec.style.FunSpec\nclass ASpec : FunSpec({\n    retries =\n        3\n    test("a") { }\n})\n';

    expect([fix(analyzer), fix(grouped), fix(multiline)]).toEqual([analyzer, grouped, multiline]);
    const main =
      'import org.junitpioneer.jupiter.RetryingTest\nclass A {\n    @RetryingTest(3)\n    fun a() { }\n}\n';

    expect(applyRecipe(kotlinRetryInTestRecipe, main)).toBe(main);
  });
  it('keeps the test annotation already on the line or a parameterized sibling, and the name', () => {
    const head =
      'import org.junit.jupiter.api.Test\nimport org.junitpioneer.jupiter.RetryingTest\n';
    const sameLine = `${head}class ATest {\n    @Test @RetryingTest(3)\n    fun a() { }\n}\n`;
    const parameterized = `${head}class ATest {\n    @RetryingTest(3)\n    @ParameterizedTest\n    fun a() { }\n}\n`;
    const named = `${head}class ATest {\n    @RetryingTest(name = "x {index}")\n    fun a() { }\n}\n`;

    expect(fix(sameLine)).toBe(
      'import org.junit.jupiter.api.Test\nclass ATest {\n    @Test\n    fun a() { }\n}\n',
    );
    expect(fix(parameterized)).toBe(
      'import org.junit.jupiter.api.Test\nclass ATest {\n    @ParameterizedTest\n    fun a() { }\n}\n',
    );
    expect(fix(named)).toBe(named);
  });
  it('never removes a retries assignment that shares its line with a lambda', () => {
    const head = 'import io.kotest.core.spec.style.FunSpec\n';
    const lambda = `${head}class ASpec : FunSpec({\n    test("a") { retries = 2 }\n    val n = run { retries = 3 }\n})\n`;

    expect(fix(lambda)).toBe(lambda);
  });
});
