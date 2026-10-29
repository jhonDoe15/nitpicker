import { describe, expect, it } from 'vitest';
import { flagsFor, JUNIT_HEAD, KOTEST_HEAD, rulesOf } from '../../test-support/sources.mjs';
import { DISABLED_RULE } from './skipped-tests.mjs';

const skipped = (text, flags) => rulesOf(text, DISABLED_RULE, flags);

describe('skips through names, conditions and assumptions', () => {
  it.each([
    [
      'an import alias, a typealias and an annotation that carries @Disabled',
      `package demo

import org.junit.jupiter.api.Disabled as Later
import org.junit.Ignore as Skip

typealias Parked = Disabled

@Disabled("work in progress")
annotation class Wip

class AccountTest {
    @Test @Later fun first() { }
    @Test @Skip fun second() { }
    @Test @Parked fun third() { }
    @Test @Wip fun fourth() { }
    @Test fun running() { }
}
`,
      [
        'AccountTest.first@12',
        'AccountTest.second@13',
        'AccountTest.third@14',
        'AccountTest.fourth@15',
      ],
    ],
    [
      'an assumption that can never hold',
      `${JUNIT_HEAD}class AccountTest {
    @Test fun first() { assumeTrue(false) }
    @Test fun second() { Assumptions.assumeFalse(true, "never") }
    @Test fun third() { Assumptions.abort<Unit>() }
    @Test fun fourth() { Assume.assumeTrue(false) }
    @Test fun real() { assumeTrue(System.getenv("CI") != null) }
}
`,
      [
        'AccountTest.first@10',
        'AccountTest.second@11',
        'AccountTest.third@12',
        'AccountTest.fourth@13',
      ],
    ],
    [
      'Kotest configs that are constant false or never run',
      `${KOTEST_HEAD}const val FLAG = false

class MySpec : FunSpec({
    test("a").config(enabled = !true) { }
    test("b").config(enabled = FLAG) { }
    test("c").config(invocations = 0) { }
    test("d").config(enabledOrReasonIf = { Enabled.disabled("later") }) { }
    test("e").config(enabledIf = { _ -> !true }) { }
    test("f").config(enabled = !FLAG) { }
})
`,
      ['MySpec > a@10', 'MySpec > b@11', 'MySpec > c@12', 'MySpec > d@13', 'MySpec > e@14'],
    ],
    [
      'an aliased x-prefixed registration',
      `${KOTEST_HEAD}import io.kotest.core.spec.style.scopes.xtest as later

class MySpec : FunSpec({
    later("a") { }
})
`,
      ['MySpec > a@10'],
    ],
  ])('reports %s', (_name, text, expected) => {
    expect(skipped(text)).toEqual(expected);
  });

  it('resolves @EnabledIf in the test class and its companion, not in another class', () => {
    const text = `${JUNIT_HEAD}class FirstTest {
    @Test
    @EnabledIf("never")
    fun first() { }

    @Test
    @EnabledIf("fromCompanion")
    fun second() { }

    companion object {
        @JvmStatic
        fun fromCompanion() = false
    }

    fun never() = false
}

class SecondTest {
    @Test
    @EnabledIf("never")
    fun other() { }

    fun never() = System.getenv("CI") != null
}
`;

    expect(skipped(text)).toEqual(['FirstTest.first@11', 'FirstTest.second@15']);
  });

  it('judges a Kotest condition class by its enabled override only', () => {
    const text = `${KOTEST_HEAD}@EnabledIf(OnCi::class)
class FirstSpec : FunSpec({
    test("a") { }
})

object OnCi : EnabledCondition {
    fun describe() = false
    override fun enabled(kclass: KClass<out Spec>): Boolean = System.getenv("CI") != null
}
`;

    expect(skipped(text)).toEqual([]);
  });

  it('reads a meta-annotation and a typealias from another file of the project', () => {
    const shared =
      'package demo\n\n@Disabled\nannotation class Wip\n\ntypealias Parked = Disabled\n';
    const text = `${JUNIT_HEAD}class AccountTest {
    @Test @Wip fun first() { }
    @Test @Parked fun second() { }
}
`;

    expect(skipped(text, flagsFor([text, shared]))).toEqual([
      'AccountTest.first@10',
      'AccountTest.second@11',
    ]);
  });
});
