import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';
import { COPY_PASTED_TEST_RULE, readCopyPastedTestFindings } from './copy-pasted-tests.mts';

const { temporaryRoot } = useGitFixtures();
const PROJECT = {
  sourceRoots: ['src/main/java'],
  testSourceRoots: ['src/test/java'],
  kotlinSourceRoots: ['src/main/kotlin'],
  kotlinTestSourceRoots: ['src/test/kotlin'],
};

function lines(files: Readonly<Record<string, string>>, options: Record<string, unknown> = {}) {
  const root = temporaryRoot('nitpicker-jvm-copied-tests-');
  writeFiles(root, files);
  return readCopyPastedTestFindings(root, { projects: [PROJECT], kotlin: true, ...options }).map(
    ({ rule, path: file, location, symbol }) =>
      `${rule} ${file}:${String(location.line)} ${symbol}`,
  );
}

function javaTests(...methods: string[]) {
  return {
    'src/test/java/shop/PriceTest.java': `package shop;\nclass PriceTest {\n${methods.join('\n')}\n}`,
  };
}

function javaTest(name: string, body: string) {
  return `  @Test\n  void ${name}() {\n    ${body}\n  }`;
}

describe('copy-pasted JVM tests', () => {
  it('reports the third and later Java tests that differ only in literals', () => {
    const body = (price: string, total: string) =>
      `assertEquals(${total}, Price.total(${price}, "EUR"));`;
    expect(
      lines(
        javaTests(
          javaTest('a', body('10', '12')),
          javaTest('b', body('20', '24')),
          javaTest('c', body('-30', '36')),
          javaTest('d', body('40', '48')),
        ),
      ),
    ).toEqual([
      `${COPY_PASTED_TEST_RULE} src/test/java/shop/PriceTest.java:12 c`,
      `${COPY_PASTED_TEST_RULE} src/test/java/shop/PriceTest.java:16 d`,
    ]);
  });

  it('names the parameterized form and the exception route', () => {
    const body = 'assertEquals(1, f(2));';
    const root = temporaryRoot('nitpicker-jvm-copied-tests-');
    writeFiles(root, javaTests(javaTest('a', body), javaTest('b', body), javaTest('c', body)));
    const [found] = readCopyPastedTestFindings(root, { projects: [PROJECT], kotlin: false });
    expect(found?.message).toBe(
      'This test repeats the body of 2 others and differs only in its literals. Put the cases in one parameterized test: `@ParameterizedTest` with `@CsvSource` or `@MethodSource` (TestNG: `@Test(dataProvider = ...)` with a `@DataProvider`), with a row per case. A test whose copies differ in a call is not a copy. An exception fits only a group that must stay separate tests, such as copies that need their own annotations. If this is intended, add {"rule":"pmd/CopyPastedTest","paths":["src/test/java/shop/PriceTest.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('allows the parameterized form, a data provider and two copies', () => {
    const parameterized = [
      '  @ParameterizedTest',
      '  @CsvSource({"10,12", "20,24"})',
      '  void total(int price, int total) {',
      '    assertEquals(total, Price.total(price, "EUR"));',
      '  }',
    ].join('\n');
    const provided = (name: string) =>
      `  @Test(dataProvider = "rows")\n  void ${name}(int a) {\n    assertEquals(1, f(2));\n  }`;
    expect(lines(javaTests(parameterized, provided('a'), provided('b'), provided('c')))).toEqual(
      [],
    );
    const body = 'assertEquals(1, f(2));';
    expect(lines(javaTests(javaTest('a', body), javaTest('b', body)))).toEqual([]);
  });

  it('does not report tests that differ in a call or in a name', () => {
    expect(
      lines(
        javaTests(
          javaTest('a', 'assertEquals(1, Price.total(2));'),
          javaTest('b', 'assertEquals(1, Price.net(2));'),
          javaTest('c', 'assertEquals(1, Price.gross(2));'),
          javaTest('d', 'assertEquals(1, Price.total(2));'),
        ),
      ),
    ).toEqual([]);
  });

  it('reports Kotlin tests with block and expression bodies and Kotest cases', () => {
    const kotlin = [
      'package shop',
      'class PriceTest {',
      '  @Test fun a() { assertEquals(12, total(10)) }',
      '  @Test fun b() { assertEquals(24, total(20)) }',
      '  @Test fun c() { assertEquals(36, total(30)) }',
      '  @Test fun d() = runTest { assertSame(12, total(10)) }',
      '  @Test fun e() = runTest { assertSame(24, total(20)) }',
      '  @Test fun f() = runTest { assertSame(36, total(30)) }',
      '}',
      'class PriceSpec : FunSpec({',
      '  test("a") { total(1) shouldBe 2 }',
      '  test("b") { total(2) shouldBe 4 }',
      '  test("c") { total(3) shouldBe 6 }',
      '})',
    ].join('\n');
    expect(lines({ 'src/test/kotlin/shop/PriceTest.kt': kotlin })).toEqual([
      `${COPY_PASTED_TEST_RULE} src/test/kotlin/shop/PriceTest.kt:5 c`,
      `${COPY_PASTED_TEST_RULE} src/test/kotlin/shop/PriceTest.kt:8 f`,
      `${COPY_PASTED_TEST_RULE} src/test/kotlin/shop/PriceTest.kt:13 c`,
    ]);
  });

  it('allows Kotest withData and Kotlin tests that differ in a call', () => {
    const kotlin = [
      'package shop',
      'class PriceSpec : FunSpec({',
      '  withData(1 to 2, 2 to 4, 3 to 6) { (a, b) -> total(a) shouldBe b }',
      '  test("a") { total(1) shouldBe 2 }',
      '  test("b") { net(2) shouldBe 4 }',
      '  test("c") { gross(3) shouldBe 6 }',
      '})',
    ].join('\n');
    expect(lines({ 'src/test/kotlin/shop/PriceSpec.kt': kotlin })).toEqual([]);
  });

  it('does not report tests whose annotation arguments differ', () => {
    const marked = (name: string, error: string) =>
      `  @Test(expected = ${error}.class)\n  void ${name}() {\n    f(1);\n  }`;
    const timed = (name: string, seconds: string) =>
      `  @Timeout(${seconds})\n  @Test\n  void ${name}() {\n    f(1);\n  }`;
    expect(
      lines(javaTests(marked('a', 'E1'), marked('b', 'E2'), marked('c', 'E3'), marked('d', 'E3'))),
    ).toEqual([]);
    expect(lines(javaTests(timed('a', '1'), timed('b', '2'), timed('c', '3')))).toHaveLength(1);
    const kotlin = [
      'class T {',
      '  @Test(expected = A::class) fun a() { f(1) }',
      '  @Test(expected = B::class) fun b() { f(1) }',
      '  @Test(expected = C::class) fun c() { f(1) }',
      '}',
    ].join('\n');
    expect(lines({ 'src/test/kotlin/shop/T.kt': kotlin })).toEqual([]);
  });

  it('skips files under exclude', () => {
    const body = 'assertEquals(1, f(2));';
    const files = javaTests(javaTest('a', body), javaTest('b', body), javaTest('c', body));
    expect(lines(files, { policy: { exclude: ['src/test/java/shop/**'] } })).toEqual([]);
  });
});
