import { describe, expect, it } from 'vitest';
import { KOTEST_HEAD, rulesOf, summaryOf } from '../../../test-support/sources.mjs';
import { RETRY_RULE } from './retry-tests.mjs';

const retries = (text) => rulesOf(text, RETRY_RULE);

describe('Kotest retries', () => {
  it('reports retries in a config chain on a test and on a container', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    test("flaky").config(retries = 3) { 1 shouldBe 1 }
    test("stable").config(timeout = 5.seconds) { 1 shouldBe 1 }
    context("group").config(retries = 2, retryDelay = 1.seconds) {
        test("inside") { 1 shouldBe 1 }
    }
    test("slow").config(retryDelay = 1.seconds) { 1 shouldBe 1 }
})

class TextSpec : StringSpec({
    "flaky".config(retries = 1) { 1 shouldBe 1 }
})
`;

    expect(retries(text)).toEqual(['MySpec > flaky@8', 'MySpec > group@10', 'TextSpec > flaky@17']);
  });

  it('reports retries set in a spec body or init block', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    retries = 2
    test("a") { 1 shouldBe 1 }
})

class InitSpec : DescribeSpec() {
    init {
        this.retries = 3
        describe("b") { it("c") { 1 shouldBe 1 } }
    }
}

class SameLineSpec : FunSpec({ retries = 4; test("d") { 1 shouldBe 1 } })
`;

    expect(retries(text)).toEqual(['MySpec@8', 'InitSpec@14', 'SameLineSpec@19']);
  });

  it('reports retries in a TestConfig or DefaultTestConfig', () => {
    const text = `${KOTEST_HEAD}import io.kotest.core.test.config.DefaultTestConfig
import io.kotest.core.test.config.TestConfig

class MySpec : FunSpec({
    defaultTestConfig = DefaultTestConfig(retries = 2)
    test("a", TestConfig(retries = 1)) { 1 shouldBe 1 }
    test("b", TestConfig(timeout = 1.seconds)) { 1 shouldBe 1 }
})
`;

    expect(retries(text)).toEqual(['MySpec@11', 'MySpec@12']);
  });

  it('reports an override of retries in a project or package config', () => {
    const text = `package demo

import io.kotest.core.config.AbstractPackageConfig
import io.kotest.core.config.AbstractProjectConfig

object ProjectConfig : AbstractProjectConfig() {
    override val retries: Int? = 2
}

class PackageConfig : AbstractPackageConfig() {
    override val retries get() = 3
}

class QuietConfig : AbstractProjectConfig() {
    override val retries: Int? = 0
    override val retryDelay = null
}
`;

    expect(retries(text)).toEqual(['ProjectConfig@7', 'PackageConfig@11']);
  });

  it.each([
    [
      'allows a literal 0, null and retryDelay alone',
      `${KOTEST_HEAD}class MySpec : FunSpec({
    retries = 0
    defaultTestConfig = DefaultTestConfig(retries = null)
    test("a").config(retries = 0) { 1 shouldBe 1 }
    test("b").config(retryDelay = 1.seconds) { 1 shouldBe 1 }
    test("c", TestConfig(retries = 0, retryDelay = 2.seconds)) { 1 shouldBe 1 }
})
`,
    ],
    [
      'keeps a local variable called retries inside a test',
      `${KOTEST_HEAD}class MySpec : FunSpec({
    test("a") {
        var retries = 0
        retries = retries + 1
        retries shouldBe 1
    }
})
`,
    ],
    [
      'keeps an assignment that is not the spec property',
      `${KOTEST_HEAD}class MySpec : FunSpec({
    val client = Client(
        retries = 3,
    )
    val other = Client(retries = 4)
    client.retries = 3
    beforeSpec { client.retries = 5 }
    afterSpec {
        retries = 6
    }
    test("a") { 1 shouldBe 1 }
})
`,
    ],
  ])('reports nothing: %s', (_name, text) => {
    expect(summaryOf(text)).toEqual([]);
  });

  it('reads a TestConfig through the fully qualified name, an alias or a star import', () => {
    const qualified = `${KOTEST_HEAD}class MySpec : FunSpec({
    test("a", io.kotest.core.test.config.TestConfig(retries = 2)) { 1 shouldBe 1 }
})
`;
    const aliased = `${KOTEST_HEAD}import io.kotest.core.test.config.TestConfig as Config

class MySpec : FunSpec({
    test("a", Config(retries = 2)) { 1 shouldBe 1 }
})
`;
    const star = `${KOTEST_HEAD}import io.kotest.core.test.config.*

class MySpec : FunSpec({
    test("a", TestConfig(retries = 2)) { 1 shouldBe 1 }
})
`;

    expect(retries(qualified)).toEqual(['MySpec@8']);
    expect(retries(aliased)).toEqual(['MySpec@10']);
    expect(retries(star)).toEqual(['MySpec@10']);
  });

  it('keeps a TestConfig of the project and one imported from another library', () => {
    const own = `${KOTEST_HEAD}class TestConfig(val retries: Int)

class MySpec : FunSpec({
    test("a") { TestConfig(retries = 2) shouldBe TestConfig(retries = 2) }
})
`;
    const other = `${KOTEST_HEAD}import com.acme.TestConfig

class MySpec : FunSpec({
    test("a") { TestConfig(retries = 2) shouldBe 1 }
})
`;

    expect(summaryOf(own)).toEqual([]);
    expect(summaryOf(other)).toEqual([]);
  });

  it('reads an override declared over several lines or lazily', () => {
    const text = `package demo

import io.kotest.core.config.AbstractProjectConfig

class Getter : AbstractProjectConfig() {
    override val retries: Int?
        get() = 3
}

class Equals : AbstractProjectConfig() {
    override val retries
        = 3
}

class Lazy : AbstractProjectConfig() {
    override val retries: Int? by lazy { 3 }
}

class Block : AbstractProjectConfig() {
    override val retries: Int?
        get() {
            return 3
        }
}

class Quiet : AbstractProjectConfig() {
    override val retries: Int?
        get() = 0
    override val parallelism = 3
}
`;

    expect(retries(text)).toEqual(['Getter@6', 'Equals@11', 'Lazy@16', 'Block@20']);
  });

  it('follows a config class of the same file that another class extends', () => {
    const text = `package demo

import io.kotest.core.config.AbstractProjectConfig

open class BaseConfig : AbstractProjectConfig()

class ProjectConfig : BaseConfig() {
    override val retries: Int? = 2
}
`;

    expect(retries(text)).toEqual(['ProjectConfig@8']);
  });

  it('resolves a constant that is zero and reports one that is not', () => {
    const text = `${KOTEST_HEAD}private const val NONE = 0
private const val LIMIT = 3

class MySpec : FunSpec({
    retries = NONE
    defaultTestConfig = DefaultTestConfig(retries = NONE)
    test("a").config(retries = NONE) { 1 shouldBe 1 }
    test("b").config(retries = LIMIT) { 1 shouldBe 1 }
})
`;

    expect(retries(text)).toEqual(['MySpec > b@14']);
  });
});
