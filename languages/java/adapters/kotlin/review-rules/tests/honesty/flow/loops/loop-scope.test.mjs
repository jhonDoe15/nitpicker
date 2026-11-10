import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf } from '../../../../test-support/sources.mjs';
import { CONTROL_FLOW_RULE } from '../assertion-flow.mjs';

const flow = (text) => rulesOf(text, CONTROL_FLOW_RULE);
const inTest = (body) => `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
${body}
    }
}
`;

describe('loops that always run and loops in helpers', () => {
  const withHelpers = (body, helpers) => `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
${body}
    }
${helpers}
}
`;

  it('allows loops with a literal count, literal ranges and do/while', () => {
    const text = inTest(`        repeat(3) { assertEquals(1, 1) }
        for (i in 0 until 3) assertTrue(i >= 0)
        for (i in 1..3) { assertTrue(i > 0) }
        for (i in (0..<2)) assertTrue(i >= 0)
        for (i in 3 downTo 1 step 1) assertTrue(i > 0)
        (1..3).forEach { assertTrue(it > 0) }
        do {
            assertTrue(next().valid)
        } while (more())`);

    expect(flow(text)).toEqual([]);
  });

  it('reports loops whose literal count or range can be empty', () => {
    const text = inTest(`        repeat(0) { assertEquals(1, 1) }
        for (i in 3 until 3) assertTrue(i >= 0)
        for (i in 3..1) assertTrue(i > 0)
        for (i in 0 until count) assertTrue(i >= 0)
        repeat(count) { assertEquals(1, 1) }
        (0 until n).forEach { assertTrue(it > 0) }`);

    expect(flow(text)).toEqual(
      [12, 13, 14, 15, 16, 17].map((line) => `OrderTest.checks@${String(line)}`),
    );
  });

  it('reports a loop in a helper the test calls, also through another helper, once', () => {
    const text = withHelpers(
      `        checkAll(load())
        checkAll(load())`,
      `    private fun checkAll(items: List<Item>) {
        items.forEach { checkOne(it) }
    }

    private fun checkOne(item: Item) {
        assertTrue(item.valid)
    }

    private fun unused(items: List<Item>) {
        for (item in items) assertTrue(item.valid)
    }`,
    );

    expect(flow(text)).toEqual(['OrderTest.checks@16']);
  });

  it('reports a loop in a test that calls an asserting helper, and follows top-level helpers', () => {
    const text = `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
        for (item in load()) verifyItem(item)
        verifyAll(load())
    }
}

fun verifyItem(item: Item) {
    assertTrue(item.valid)
}

fun verifyAll(items: List<Item>) {
    for (item in items) {
        assertTrue(item.valid)
    }
}
`;

    expect(flow(text)).toEqual(['OrderTest.checks@12', 'OrderTest.checks@22']);
  });

  it('allows a helper loop that asserts nothing, always runs or builds data', () => {
    const text = withHelpers(
      `        val items = build()
        assertEquals(3, items.size)
        retry()`,
      `    private fun build(): List<Item> {
        val items = mutableListOf<Item>()
        for (i in 1..3) items.add(Item(i))
        return items
    }

    private fun retry() {
        repeat(3) { assertTrue(ping()) }
    }`,
    );

    expect(flow(text)).toEqual([]);
  });
});

describe('which helper a call reaches', () => {
  const withClasses = (test, helpers, other) => `${JUNIT_HEAD}${other}
class OrderTest {
    @Test
    fun checks() {
${test}
    }
${helpers}
}
`;
  const LOOP = 'for (e in items) assertEquals(1, e)';

  it.each([
    [
      'a helper of the same name in another class',
      withClasses('        h()', '    fun h() { println() }', `class A { fun h() { ${LOOP} } }`),
    ],
    [
      'an overload the call cannot be told apart from',
      withClasses(
        '        h(1)',
        `    fun h(a: Int) { println(a) }\n    fun h(a: String) { ${LOOP} }`,
        '',
      ),
    ],
    [
      'a local function that shadows the helper',
      withClasses('        fun h() { println() }\n        h()', `    fun h() { ${LOOP} }`, ''),
    ],
  ])('does not follow %s', (_name, text) => {
    expect(flow(text)).toEqual([]);
  });

  it('follows a helper called with a trailing lambda, through a reference and in a companion', () => {
    const text = withClasses(
      '        withCases { println(it) }\n        run(::loopsOver)\n        inCompanion()',
      `    fun withCases(f: (Int) -> Unit) { ${LOOP} }
    fun check(item: Int) { assertTrue(item > 0) }
    fun loopsOver() { for (x in items) check(x) }
    companion object {
        fun inCompanion() { ${LOOP} }
    }`,
      '',
    );

    expect(flow(text)).toEqual([17, 19, 21].map((line) => `OrderTest.checks@${String(line)}`));
  });

  it('decides quickly for many helpers that call each other and assert nothing', () => {
    const names = Array.from({ length: 30 }, (_, index) => `f${String(index)}`);
    const helpers = names
      .map((name) => `    fun ${name}() { ${names.map((other) => `${other}()`).join('; ')} }`)
      .join('\n');
    const started = performance.now();

    expect(flow(withClasses('        for (x in items) f0()', helpers, ''))).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
