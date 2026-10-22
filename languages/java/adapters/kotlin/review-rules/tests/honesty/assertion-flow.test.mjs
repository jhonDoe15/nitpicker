import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf, summaryOf } from '../../test-support/sources.mjs';
import { CONTROL_FLOW_RULE } from './assertion-flow.mjs';

const flow = (text) => rulesOf(text, CONTROL_FLOW_RULE);
const inTest = (body) => `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
${body}
    }
}
`;

describe('assertions in conditionals of JUnit tests', () => {
  it('reports an assertion inside if, else and else if', () => {
    const text = inTest(`        val result = load()
        if (result.ok) {
            assertEquals(1, result.size)
        }
        if (result.ok) assertEquals(1, 1) else assertEquals(2, 2)
        if (result.a) {
            println("a")
        } else if (result.b) {
            assertEquals(1, 2)
        }`);

    expect(flow(text)).toEqual([
      'OrderTest.checks@13',
      'OrderTest.checks@16',
      'OrderTest.checks@17',
    ]);
  });

  it('reports an assertion inside when, with or without a subject', () => {
    const text = inTest(`        when (kind) {
            "a" -> assertEquals(1, 1)
            else -> println("b")
        }
        when {
            ready -> verify { service.run() }
        }`);

    expect(flow(text)).toEqual(['OrderTest.checks@12', 'OrderTest.checks@16']);
  });

  it('reports once for nested control flow, at the outer statement', () => {
    const text = inTest(`        if (a) {
            if (b) {
                assertEquals(1, 1)
            }
            when (c) { 1 -> assertTrue(true) }
        }`);

    expect(flow(text)).toEqual(['OrderTest.checks@12']);
  });

  it('recognizes assertion libraries by the names the test-assertion rule knows', () => {
    const text = inTest(`        if (a) assertThat(x).isEqualTo(1)
        if (a) x shouldBe 1
        if (a) x.shouldNotBeNull()
        if (a) verify(exactly = 1) { mock.run() }
        if (a) mockMvc.perform(get("/")).andExpect(status().isOk)
        if (a) expectThat(x).isEqualTo(1)
        if (a) assertIs<Foo>(x)`);

    expect(flow(text)).toHaveLength(7);
  });

  it('allows a conditional that asserts nothing, an if that only fails and a branch value', () => {
    const text = inTest(`        val result = if (a) 1 else 2
        if (b == null) {
            fail("missing")
        }
        if (c) return
        val label = when (kind) { "a" -> "x" else -> "y" }
        assertEquals(result, label)
        assertEquals(if (a) 1 else 2, result)
        check(result > 0)`);

    expect(flow(text)).toEqual([]);
  });
});

describe('assertions in loops of JUnit tests', () => {
  it('reports a loop over a literal list of cases, inline or declared in the test', () => {
    const text = inTest(`        for (case in listOf(1, 2, 3)) {
            assertEquals(case, double(case))
        }
        val cases = mapOf(1 to 2, 3 to 6)
        for ((input, expected) in cases) {
            assertEquals(expected, double(input))
        }
        cases.forEach { (input, expected) -> assertEquals(expected, double(input)) }
        arrayOf("a", "b").forEach { assertTrue(it.isNotEmpty()) }
        listOf(1, 2)
            .forEach { assertTrue(it > 0) }`);

    expect(flow(text)).toEqual([
      'OrderTest.checks@12',
      'OrderTest.checks@16',
      'OrderTest.checks@19',
      'OrderTest.checks@20',
      'OrderTest.checks@22',
    ]);
  });

  it('allows a loop over the results of the code under test', () => {
    const text = inTest(`        val items = service.load()
        for (item in items) {
            assertTrue(item.valid)
        }
        items.forEach { assertTrue(it.valid) }
        for (index in 0 until items.size) {
            assertEquals(expected[index], items[index])
        }
        while (queue.isNotEmpty()) {
            assertTrue(queue.poll().valid)
        }`);

    expect(flow(text)).toEqual([]);
  });

  it('allows a loop over cases that asserts nothing', () => {
    const text = inTest(`        val results = listOf(1, 2).map { double(it) }
        for (case in listOf(1, 2)) {
            println(case)
        }
        assertEquals(listOf(2, 4), results)`);

    expect(flow(text)).toEqual([]);
  });

  it('keeps the parameterized forms', () => {
    const text = `${JUNIT_HEAD}class OrderTest {
    @ParameterizedTest
    @CsvSource("1,2", "2,4")
    fun doubles(input: Int, expected: Int) {
        assertEquals(expected, double(input))
    }

    @TestFactory
    fun dynamic() = listOf(1, 2).map { case ->
        dynamicTest("case $case") {
            if (case > 1) assertEquals(1, 1)
        }
    }
}
`;

    expect(flow(text)).toEqual([]);
  });

  it('judges the body of a parameterized, repeated or expression-bodied test the same way', () => {
    const text = `${JUNIT_HEAD}class OrderTest {
    @ParameterizedTest
    @ValueSource(ints = [1, 2])
    fun first(value: Int) {
        if (value > 1) assertEquals(1, 1)
    }

    @RepeatedTest(3)
    fun second() {
        when (kind) { 1 -> assertEquals(1, 1) }
    }

    @Test
    fun third() = runTest {
        if (ready) assertEquals(1, 1)
    }
}
`;

    expect(flow(text)).toEqual(['OrderTest.first@13', 'OrderTest.second@18', 'OrderTest.third@23']);
  });
});

describe('assertions in control flow of Kotest tests', () => {
  it('reports the leaf test body and not the container that registers tests', () => {
    const text = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    context("group") {
        test("a") {
            if (ready) {
                1 shouldBe 1
            }
        }
        test("b") {
            listOf(1, 2).forEach { it shouldBe it }
        }
        test("c") { 1 shouldBe 1 }
    }
})
`;

    expect(flow(text)).toEqual(['OrderSpec > group > a@10', 'OrderSpec > group > b@15']);
  });

  it('allows tests registered in a loop and data-driven tests', () => {
    const text = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    context("cases") {
        listOf(1, 2).forEach { case ->
            test("case $case") { case shouldBe case }
        }
        withData(1, 2) { case -> case shouldBe case }
        forAll(table(headers("a"), row(1), row(2))) { a -> a shouldBe a }
    }
    "string spec style" {
        for (case in listOf(1, 2)) {
            test("x") { case shouldBe case }
        }
    }
})
`;

    expect(summaryOf(text)).toEqual([]);
  });

  it('judges a withData body like any other test body', () => {
    const text = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    withData(1, 2) { case ->
        if (case > 1) {
            case shouldBe 2
        }
    }
})
`;

    expect(flow(text)).toEqual(['OrderSpec > withData@9']);
  });
});
