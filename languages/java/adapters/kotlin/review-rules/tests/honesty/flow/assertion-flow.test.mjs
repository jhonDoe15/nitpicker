import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf, summaryOf } from '../../../test-support/sources.mjs';
import { CONTROL_FLOW_RULE } from './assertion-flow.mjs';

const MOCK_HEAD = `${JUNIT_HEAD.trimEnd()}
import io.mockk.verify

`;
const flow = (text) => rulesOf(text, CONTROL_FLOW_RULE);
const inTest = (body, head = JUNIT_HEAD) => `${head}class OrderTest {
    @Test
    fun checks() {
${body}
    }
}
`;
const mocked = (body) => inTest(body, MOCK_HEAD);

describe('assertions in conditionals of JUnit tests', () => {
  it.each([
    [
      'an if, an else and an else if',
      inTest(`        val result = load()
        if (result.ok) {
            assertEquals(1, result.size)
        }
        if (result.ok) assertEquals(1, 1) else println("no")
        if (result.a) {
            println("a")
        } else if (result.b) {
            assertEquals(1, 2)
        }`),
      ['OrderTest.checks@13', 'OrderTest.checks@16', 'OrderTest.checks@17'],
    ],
    [
      'a when with or without a subject, and a when over values that may match no branch',
      mocked(`        when (kind) {
            "a" -> assertEquals(1, 1)
            else -> println("b")
        }
        when {
            ready -> verify { service.run() }
        }
        when (count) {
            1 -> assertEquals(1, 1)
            2 -> assertEquals(2, 2)
        }`),
      ['OrderTest.checks@13', 'OrderTest.checks@17', 'OrderTest.checks@20'],
    ],
    [
      'nested control flow once, at the outer statement',
      inTest(`        if (a) {
            if (b) {
                assertEquals(1, 1)
            }
            when (c) { 1 -> assertTrue(true) }
        }`),
      ['OrderTest.checks@12'],
    ],
    [
      'the assertion libraries it knows',
      mocked(`        if (a) assertThat(x).isEqualTo(1)
        if (a) x shouldBe 1
        if (a) x.shouldNotBeNull()
        if (a) verify(exactly = 1) { mock.run() }
        if (a) mockMvc.perform(get("/")).andExpect(status().isOk)
        if (a) expectThat(x).isEqualTo(1)
        if (a) assertIs<Foo>(x)`),
      [13, 14, 15, 16, 17, 18, 19].map((line) => `OrderTest.checks@${String(line)}`),
    ],
    [
      'the inner if of an if/else whose branches all assert',
      inTest(`        if (a) {
            if (b) assertEquals(1, 1)
        } else {
            assertEquals(2, 2)
        }`),
      ['OrderTest.checks@13'],
    ],
  ])('reports %s', (_name, text, expected) => {
    expect(flow(text)).toEqual(expected);
  });

  it.each([
    [
      'a conditional that asserts nothing, an if that only fails and a branch value',
      inTest(`        val result = if (a) 1 else 2
        if (b == null) {
            fail("missing")
        }
        val label = when (kind) { "a" -> "x" else -> "y" }
        assertEquals(result, label)
        assertEquals(if (a) 1 else 2, result)
        check(result > 0)`),
    ],
    [
      'an if/else or a when whose branches all assert or fail',
      mocked(`        if (r == null) fail("x") else assertEquals(1, r)
        if (a) {
            assertEquals(1, 1)
        } else {
            assertEquals(2, 2)
        }
        when (outcome) {
            is Ok -> assertEquals(1, outcome.value)
            is Err -> fail("expected success")
        }
        when (color) {
            Color.RED -> verify { painter.red() }
            Color.BLUE -> verify { painter.blue() }
        }
        when {
            a -> assertTrue(a)
            else -> throw AssertionError("no")
        }
        if (a) assertTrue(a) else error("bad")`),
    ],
    [
      'calls that only look like assertions, and an assertion in a condition',
      inTest(`        if (policy.shouldRetry(e)) retry()
        if (verifyUser(user)) proceed()
        if (a) server.expect(requestTo("/")).andExpect(method(GET)).andRespond(withSuccess())
        if (a) expectRequest()
        if (a) verify(token)
        if (assertReady()) println("ready")`),
    ],
    [
      'preconditions in a property test',
      `${KOTEST_HEAD}class OrderSpec : FunSpec({
    test("property") {
        checkAll(Arb.int()) { a ->
            if (a > 0) {
                a shouldBe a
            }
        }
        forAll<Int> { a -> if (a > 0) a > -1 else true }
    }
})

class OrderTest {
    @Property
    fun jqwik(@ForAll value: Int) {
        if (value > 0) assertTrue(value > 0)
    }
}
`,
    ],
    [
      'executables grouped in assertAll',
      inTest(`        assertAll(items.map { item -> Executable { assertTrue(item.valid) } })`),
    ],
  ])('allows %s', (_name, text) => {
    expect(flow(text)).toEqual([]);
  });
});

describe('assertions in loops and other skippable code of JUnit tests', () => {
  it.each([
    [
      'every loop, over cases or over results',
      inTest(`        for (case in listOf(1, 2, 3)) {
            assertEquals(case, double(case))
        }
        val items = service.load()
        for (item in items) assertTrue(item.valid)
        items.forEach { assertTrue(it.valid) }
        while (queue.isNotEmpty()) {
            assertTrue(queue.poll().valid)
        }
        do {
            assertTrue(next().valid)
        } while (more())
        repeat(3) { assertEquals(1, 1) }
        items.map { assertTrue(it.valid) }
        optional.ifPresent { assertTrue(it.valid) }
        flow.collect { assertTrue(it.valid) }
        listOf(1, 2)
            .forEach { assertTrue(it > 0) }`),
      [12, 16, 17, 18, 21, 24, 25, 26, 27, 29].map((line) => `OrderTest.checks@${String(line)}`),
    ],
    [
      'a try/catch that swallows the failure and a runCatching',
      inTest(`        try {
            assertEquals(1, compute())
        } catch (e: AssertionError) {
            println(e)
        }
        try { assertTrue(ok()) } catch (e: Throwable) { }
        runCatching { assertEquals(1, compute()) }`),
      ['OrderTest.checks@12', 'OrderTest.checks@17', 'OrderTest.checks@18'],
    ],
    [
      'a safe call, takeIf, && and ||, an elvis that asserts and an early return',
      inTest(`        result?.let { assertEquals(1, it.size) }
        result.takeIf { it.ok }?.also { assertTrue(it.ok) }
        ready && assertTrue(done)
        failed || assertFalse(done)
        val value = result ?: run { assertTrue(skipped); return }
        if (!enabled) return
        assertEquals(1, value)`),
      [12, 13, 14, 15, 16, 17].map((line) => `OrderTest.checks@${String(line)}`),
    ],
  ])('reports %s', (_name, text, expected) => {
    expect(flow(text)).toEqual(expected);
  });

  it.each([
    [
      'a loop or a lambda that asserts nothing',
      inTest(`        val results = listOf(1, 2).map { double(it) }
        for (case in listOf(1, 2)) {
            println(case)
        }
        assertEquals(listOf(2, 4), results)`),
    ],
    [
      'a catch of the expected exception, a rethrowing catch and runCatching with getOrThrow',
      inTest(`        try {
            parse("x")
            fail("expected an exception")
        } catch (e: IllegalArgumentException) {
            assertEquals("bad", e.message)
        }
        try {
            assertTrue(ok())
        } catch (e: Throwable) {
            throw IllegalStateException(e)
        }
        runCatching { assertTrue(ok()) }.getOrThrow()`),
    ],
    [
      'a plain let, an elvis that fails and && inside a condition',
      inTest(`        result.let { assertEquals(1, it.size) }
        val value = result ?: fail("missing")
        if (a && assertReady()) println("x")
        assertEquals(1, value)`),
    ],
  ])('allows %s', (_name, text) => {
    expect(flow(text)).toEqual([]);
  });
});

describe('the test functions and Kotest bodies it reads', () => {
  it('reads parameterized, repeated, expression-bodied, one-line and backticked tests', () => {
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

    @Test fun fourth() { if (x) assertEquals(1, 1) }

    @Test
    fun \`returns empty (when none) = {}\`() {
        if (x) assertEquals(1, 1)
    }
}
`;

    expect(flow(text)).toEqual([
      'OrderTest.first@13',
      'OrderTest.second@18',
      'OrderTest.third@23',
      'OrderTest.fourth@26',
      'OrderTest.returns empty (when none) = {}@30',
    ]);
  });

  it('keeps a parameterized test and a test factory', () => {
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

  it('reports the leaf Kotest bodies, also of tests registered in a loop or withData', () => {
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
    listOf(1, 2).forEach { case ->
        test("case $case") { if (case > 1) case shouldBe 2 }
    }
    withData(1, 2) { case ->
        if (case > 1) {
            case shouldBe 2
        }
    }
})
`;

    expect(flow(text)).toEqual([
      'OrderSpec > group > a@10',
      'OrderSpec > group > b@15',
      'OrderSpec > case $case@20',
      'OrderSpec > withData@23',
    ]);
  });

  it('allows the data-driven Kotest forms', () => {
    const text = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    context("cases") {
        withData(1, 2) { case -> case shouldBe case }
        forAll(table(headers("a"), row(1), row(2))) { a -> a shouldBe a }
    }
})
`;

    expect(summaryOf(text)).toEqual([]);
  });
});
