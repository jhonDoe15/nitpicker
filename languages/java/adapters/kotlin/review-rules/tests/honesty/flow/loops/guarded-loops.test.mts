import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, rulesOf } from '../../../../test-support/sources.mts';
import { CONTROL_FLOW_RULE } from '../assertion-flow.mts';

function flow(body: string): string[] {
  return rulesOf(
    `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
${body}
    }
}
`,
    CONTROL_FLOW_RULE,
  );
}

describe('Kotlin loops that cannot pass silently', () => {
  it('allows a loop over a literal with items', () => {
    expect(
      flow(`        for (name in listOf("ada", "bob")) assertEquals(3, name.length)
        setOf(1, 2).forEach { assertTrue(it > 0) }
        arrayOf("x").forEach { assertEquals(1, it.length) }`),
    ).toEqual([]);
  });

  it('reports a loop over an empty literal, a spread array and a built list', () => {
    expect(
      flow(`        for (name in listOf<String>()) assertEquals(3, name.length)
        for (name in listOf(*names)) assertEquals(3, name.length)
        load().forEach { assertTrue(it > 0) }`),
    ).toEqual([12, 13, 14].map((line) => `OrderTest.checks@${String(line)}`));
  });

  it('allows a loop over a collection whose size the test asserted first', () => {
    expect(
      flow(`        val names = load()
        assertEquals(2, names.size)
        for (name in names) assertEquals(3, name.length)
        val others = load()
        others shouldHaveSize 2
        others.forEach { assertEquals(3, it.length) }
        val more = load()
        assertThat(more).isNotEmpty()
        more.forEach { assertEquals(3, it.length) }`),
    ).toEqual([]);
  });

  it('reports a loop when the size is asserted empty, for another list, afterwards or in a branch', () => {
    expect(
      flow(`        val names = load()
        val others = load()
        assertEquals(0, names.size)
        assertEquals(2, others.size)
        for (name in names) assertEquals(3, name.length)
        val late = load()
        late.forEach { assertEquals(3, it.length) }
        assertEquals(2, late.size)
        val maybe = load()
        if (flag) { assertEquals(2, maybe.size) }
        maybe.forEach { assertEquals(3, it.length) }`),
    ).toEqual([16, 18, 21, 22].map((line) => `OrderTest.checks@${String(line)}`));
  });

  it('allows a loop when a variable it writes is asserted after it, and reports it otherwise', () => {
    expect(
      flow(`        var found = false
        for (name in load()) {
            if (name == "ada") found = true
            assertEquals(3, name.length)
        }
        assertTrue(found)
        var count = 0
        for (name in load()) {
            count++
            assertEquals(3, name.length)
        }
        println(count)`),
    ).toEqual(['OrderTest.checks@19']);
  });
});
