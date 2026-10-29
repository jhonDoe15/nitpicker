import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf, summaryOf } from '../../test-support/sources.mjs';
import { DISABLED_RULE } from './skipped-tests.mjs';

const skipped = (text) => rulesOf(text, DISABLED_RULE);

describe('skipped JUnit and kotlin.test tests', () => {
  it.each([
    [
      'reports @Disabled and @Ignore on a test, with or without a reason',
      `${JUNIT_HEAD}class AccountTest {
    @Test
    @Disabled("flaky")
    fun first() { assertEquals(1, 1) }

    @Test
    @org.junit.Ignore
    fun second() { assertEquals(1, 1) }

    @kotlin.test.Ignore @Test fun third() { assertEquals(1, 1) }

    @Test
    fun running() { assertEquals(1, 1) }
}
`,
      ['AccountTest.first@11', 'AccountTest.second@15', 'AccountTest.third@18'],
    ],
    [
      'reports a disabled class once, not every test in it',
      `${JUNIT_HEAD}@Disabled
class AccountTest {
    @Test fun first() { assertEquals(1, 1) }
    @Test fun second() { assertEquals(1, 1) }
}
`,
      ['AccountTest@9'],
    ],
    [
      'reports a nested class under a disabled outer class once at the outer class',
      `${JUNIT_HEAD}@Disabled
class OuterTest {
    @Test fun top() { assertEquals(1, 1) }

    @Nested
    inner class InnerTest {
        @Test fun deep() { assertEquals(1, 1) }
    }
}
`,
      ['OuterTest@9'],
    ],
    [
      'reports TestNG enabled = false and parameterized or repeated tests',
      `${JUNIT_HEAD}class AccountTest {
    @Test(enabled = false)
    fun first() { assertEquals(1, 1) }

    @org.junit.jupiter.params.ParameterizedTest
    @Disabled
    fun second(value: Int) { assertEquals(1, value) }
}
`,
      ['AccountTest.first@10', 'AccountTest.second@14'],
    ],
    [
      'reports a condition that is constant false and ignores one that depends on the environment',
      `${JUNIT_HEAD}class AccountTest {
    @Test
    @EnabledIf("never")
    fun first() { assertEquals(1, 1) }

    @Test
    @DisabledIf("always")
    fun second() { assertEquals(1, 1) }

    @Test
    @EnabledIf("false")
    fun third() { assertEquals(1, 1) }

    @Test
    @EnabledIf("dynamic")
    fun fourth() { assertEquals(1, 1) }

    @Test
    @DisabledOnOs(OS.WINDOWS)
    fun fifth() { assertEquals(1, 1) }

    @Test
    @EnabledIfSystemProperty(named = "ci", matches = "true")
    fun sixth() { assertEquals(1, 1) }

    fun never() = false
    fun always(): Boolean { return true }
    fun dynamic() = System.getenv("CI") != null
}
`,
      ['AccountTest.first@11', 'AccountTest.second@15', 'AccountTest.third@19'],
    ],
    [
      'reports a Kotest AnnotationSpec test with @Ignore',
      `${KOTEST_HEAD}class LegacySpec : AnnotationSpec() {
    @Test
    @Ignore
    fun first() { 1 shouldBe 1 }
}
`,
      ['LegacySpec.first@9'],
    ],
    [
      'ignores @Disabled in a comment or a string and annotations on helpers',
      `${JUNIT_HEAD}class AccountTest {
    // @Disabled("later")
    @Test
    fun first() { assertEquals("@Disabled", "@Disabled") }

    @Disabled
    fun helper() = 1
}
`,
      [],
    ],
  ])('%s', (_name, text, expected) => {
    expect(skipped(text)).toEqual(expected);
  });
});

describe('skipped Kotest tests', () => {
  it.each([
    [
      'reports the x-prefixed registrations of every spec style',
      `${KOTEST_HEAD}class MySpec : FunSpec({
    xtest("a") { 1 shouldBe 1 }
    xcontext("b") {
        test("inside") { 1 shouldBe 1 }
    }
    xdescribe("c") { xit("d") { 1 shouldBe 1 } }
    xshould("e") { 1 shouldBe 1 }
    xgiven("f") { }
    xGiven("g") { }
    test("running") { 1 shouldBe 1 }
})
`,
      [
        'MySpec > a@8',
        'MySpec > b@9',
        'MySpec > c@12',
        'MySpec > e@13',
        'MySpec > f@14',
        'MySpec > g@15',
      ],
    ],
    [
      'reports .config(enabled = false) and a constant false enabledIf',
      `${KOTEST_HEAD}class MySpec : FunSpec({
    test("a").config(enabled = false) { 1 shouldBe 1 }
    test("b").config(invocations = 2, enabledIf = { false }) { 1 shouldBe 1 }
    test("c").config(enabled = true) { 1 shouldBe 1 }
    test("d").config(enabledIf = { System.getenv("CI") != null }) { 1 shouldBe 1 }
    test("e").config(invocations = 3) { 1 shouldBe 1 }
})
`,
      ['MySpec > a@8', 'MySpec > b@9'],
    ],
    [
      'reports string specs with config and the bang prefix, in init blocks as well',
      `${KOTEST_HEAD}class MySpec : StringSpec() {
    init {
        "a".config(enabled = false) { 1 shouldBe 1 }
        "!b" { 1 shouldBe 1 }
        "c" { 1 shouldBe 1 }
    }
}
`,
      ['MySpec > a@9', 'MySpec > !b@10'],
    ],
    [
      'reports a spec annotated @Ignored and a Kotest condition class that is constant false',
      `${KOTEST_HEAD}@Ignored
class FirstSpec : FunSpec({
    test("a") { 1 shouldBe 1 }
})

@EnabledIf(NeverEnabled::class)
class SecondSpec : FunSpec({
    test("a") { 1 shouldBe 1 }
})

@EnabledIf(EnvEnabled::class)
class ThirdSpec : FunSpec({
    test("a") { 1 shouldBe 1 }
})

object NeverEnabled : EnabledCondition {
    override fun enabled(kclass: KClass<out Spec>): Boolean = false
}

object EnvEnabled : EnabledCondition {
    override fun enabled(kclass: KClass<out Spec>): Boolean = System.getenv("CI") != null
}
`,
      ['FirstSpec@7', 'SecondSpec@12'],
    ],
  ])('%s', (_name, text, expected) => {
    expect(skipped(text)).toEqual(expected);
  });

  it('is quiet for a spec without skips', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    context("a") { test("b") { 1 shouldBe 1 } }
    test("x marks the spot") { 1 shouldBe 1 }
})
`;

    expect(summaryOf(text)).toEqual([]);
  });
});
