import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD } from '../test-support/sources.mjs';
import { scanTestFile } from './discovery/test-units.mjs';
import { projectFlags } from './project-flags.mjs';
import { fileReports } from './test-honesty.mjs';

const JUNIT = `${JUNIT_HEAD}class OrderTest(private val io: CoroutineDispatcher = Dispatchers.IO) {
    private val scope = CoroutineScope(Dispatchers.IO)

    @AfterEach
    fun tearDown() { scope.cancel() }

    @Test
    @EnabledIf("never")
    fun \`checks (all) = {}\`() = runTest {
        when (kind) {
            is Ok -> assertEquals(1, 1)
            else -> fail("x")
        }
        if (a) assertTrue(b) else if (c) { assertTrue(d) } else error("e")
        try { assertTrue(ok()) } catch (e: Throwable) { }
        withContext(io + testDispatcher) { while (!done()) delay(10) }
        val d = scope
            .async { 2 }
        result?.let { assertEquals(1, it) } ?: run { assertTrue(x); return@runTest }
        with(CoroutineScope(Job())) { launch { } }
        for (i in 1..5) { delay(10) }
        do { delay(1) } while (false)
    }

    fun never() = false
}
`;
const KOTEST = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    coroutineTestScope = true
    context("a") {
        xtest("b").config(enabled = !true) { 1 shouldBe 1 }
        listOf(1, 2).forEach { test("c $it") { if (it > 1) it shouldBe 2 } }
        withData(1, 2) { delay(5) }
    }
    "free" - { "inner" { } }
    include(shared)
})

val shared = funSpec { test("d") { } }
`;

function reportsOf(text) {
  const scanned = scanTestFile(text);
  if (scanned === undefined) {
    return [];
  }
  return fileReports(scanned, projectFlags([{ scanned }]));
}

describe('truncated and unbalanced sources', () => {
  it.each([
    ['a JUnit test file', JUNIT],
    ['a Kotest spec', KOTEST],
  ])('never throws on any prefix of %s', (_name, text) => {
    const lengths = Array.from({ length: text.length + 1 }, (_value, index) => index);

    const failures = lengths.filter((length) => {
      try {
        reportsOf(text.slice(0, length));
        return false;
      } catch {
        return true;
      }
    });

    expect(failures).toEqual([]);
  });

  it.each([
    ['extra closing braces', `${JUNIT}}}})\n`],
    ['a when without a body', `${JUNIT_HEAD}class A {\n    @Test fun t() { when (x) }\n}\n`],
    ['an if without a condition', `${JUNIT_HEAD}class A {\n    @Test fun t() { if }\n}\n`],
    ['a lone closing paren', `${KOTEST_HEAD}class S : FunSpec({ ) test("a") { } })\n`],
  ])('never throws on %s', (_name, text) => {
    expect(() => reportsOf(text)).not.toThrow();
  });
});
