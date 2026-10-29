import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf, summaryOf } from '../../test-support/sources.mjs';
import { FOCUSED_RULE } from './focused-tests.mjs';

const focused = (text) => rulesOf(text, FOCUSED_RULE);

describe('focused Kotest tests', () => {
  it('reports the f: name prefix in every registration style', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    test("f: first") { 1 shouldBe 1 }
    test("second") { 1 shouldBe 1 }
    context("f:third") {
        test("inside") { 1 shouldBe 1 }
    }
})

class TextSpec : StringSpec({
    "f: fourth" { 1 shouldBe 1 }
    "fifth" { 1 shouldBe 1 }
})

class TreeSpec : FreeSpec({
    "f: sixth" - {
        "seventh" { 1 shouldBe 1 }
    }
})
`;

    expect(focused(text)).toEqual([
      'MySpec > f: first@8',
      'MySpec > f:third@10',
      'TextSpec > f: fourth@16',
      'TreeSpec > f: sixth@21',
    ]);
  });

  it('reports the f-prefixed registrations', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    ftest("a") { 1 shouldBe 1 }
    fcontext("b") { test("inside") { 1 shouldBe 1 } }
    fdescribe("c") { fit("d") { 1 shouldBe 1 } }
    fshould("e") { 1 shouldBe 1 }
    fgiven("f") { }
    test("fine") { 1 shouldBe 1 }
})
`;

    expect(focused(text)).toEqual([
      'MySpec > a@8',
      'MySpec > b@9',
      'MySpec > c@10',
      'MySpec > e@11',
      'MySpec > f@12',
    ]);
  });

  it('reports a focused test inside an init block and a config chain', () => {
    const text = `${KOTEST_HEAD}class MySpec : DescribeSpec() {
    init {
        describe("group") {
            fit("only this") { 1 shouldBe 1 }
            it("other").config(enabled = true) { 1 shouldBe 1 }
        }
    }
}
`;

    expect(focused(text)).toEqual(['MySpec > group > only this@10']);
  });

  it('keeps names that merely look like a focus', () => {
    const text = `${KOTEST_HEAD}class MySpec : FunSpec({
    test("fast path") { 1 shouldBe 1 }
    test("f is the first letter") { 1 shouldBe 1 }
    test("tf: not a prefix") { 1 shouldBe 1 }
    fixture("setup") { }
    context("full") { test("x") { 1 shouldBe 1 } }
})
`;

    expect(summaryOf(text)).toEqual([]);
  });

  it('has no focus form for JUnit tests', () => {
    const text = `${JUNIT_HEAD}class AccountTest {
    @Test
    fun \`f: reads like a focus\`() { assertEquals(1, 1) }
}
`;

    expect(focused(text)).toEqual([]);
  });
});
