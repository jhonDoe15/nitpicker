import { describe, expect, it } from 'vitest';
import { JUNIT_HEAD, KOTEST_HEAD, rulesOf, summaryOf } from '../../../test-support/sources.mjs';
import { WEAK_RULE } from './weak-reports.mjs';

const FIRST_BODY_LINE = 12;
const MARK = ' // weak';
const inTest = (body) => `${JUNIT_HEAD}class OrderTest {
    @Test
    fun checks() {
${body}
    }
}
`;
const flagged = (body) => {
  const lines = body.split('\n');
  return rulesOf(inTest(body), WEAK_RULE).map((entry) =>
    lines[Number(entry.split('@')[1]) - FIRST_BODY_LINE].replace(MARK, '').trim(),
  );
};
const marked = (body) =>
  body
    .split('\n')
    .filter((line) => line.endsWith(MARK))
    .map((line) => line.replace(MARK, '').trim());

describe('weak assertions in JUnit tests', () => {
  it.each([
    [
      'a not-null check that guards nothing later in the test',
      `        assertNotNull(order) // weak
        assertNotNull(customer, "customer") // weak
        assertNotNull("shipment", shipment) // weak
        assertTrue(invoice != null) // weak
        assertFalse(receipt == null) // weak
        assertThat(parcel).isNotNull() // weak
        basket.shouldNotBeNull() // weak
        buyer shouldNotBe null // weak
        Assertions.assertNotNull(qa) // weak
        kotlin.test.assertNotNull(qb) // weak
        org.junit.Assert.assertNotNull(qc) // weak
        qd // weak
            .shouldNotBeNull()
        val copy = other.shipment`,
    ],
    [
      'a not-null check that Kotlin smart-casts for a later use of the same value',
      `        assertNotNull(order)
        assertEquals(1, order.id)
        assertNotNull(order.customer, "customer")
        assertEquals("a", order.customer.name)
        assertTrue(invoice != null)
        assertEquals(1, invoice.lines)
        assertFalse(receipt == null)
        assertEquals(1, receipt!!.total)
        shipment.shouldNotBeNull()
        shipment.id shouldBe 1
        parcel shouldNotBe null
        parcel.weight shouldBe 2`,
    ],
    [
      'a not-null check whose result or block is used, and assertions that check a value',
      `        val id = assertNotNull(order).id
        val name = assertNotNull(customer)
        assertNotNull(invoice) { assertEquals(1, it.lines) }
        assertNotNull(receipt).total
        assertThat(shipment).isNotNull().isEqualTo(expected)
        assertThat(parcel).isEqualTo(expected)
        assertEquals(expected, actual)
        assertTrue(ready)
        println("assertNotNull(x) and x shouldNotBe null")
        // assertNotNull(y)
        assertNotEquals(null, z)
        x.shouldNotBeNull() shouldBe 3
        list.shouldNotBeEmpty() shouldHaveSize 3
        list.shouldNotBeEmpty() shouldContainExactly listOf(1)`,
    ],
    [
      'a not-null check that is not guarded by the same name on another receiver',
      `        assertNotNull(shipment) // weak
        val other = backup.shipment
        val again = shipments`,
    ],
    [
      'a presence check followed by an assertion on the next line',
      `        x.shouldNotBeNull() // weak
        y shouldBe 3
        list.shouldNotBeEmpty() // weak
        other shouldHaveSize 3`,
    ],
    [
      'a check that only says something is there',
      `        assertTrue(items.isNotEmpty()) // weak
        assertTrue(text.isNotBlank()) // weak
        assertFalse(rows.isEmpty()) // weak
        assertFalse(label.isBlank(), "label") // weak
        assertTrue(cells.size > 0) // weak
        assertTrue(cols.size >= 1) // weak
        assertTrue(names.size != 0, "names") // weak
        assertTrue(0 < tags.size) // weak
        assertTrue(word.length > 0) // weak
        assertTrue(files.count() > 0) // weak
        assertNotEquals(0, lines.size) // weak
        assertNotEquals(paths.size, 0L) // weak
        keys.shouldNotBeEmpty() // weak
        words.shouldHaveAtLeastSize(1) // weak
        ids.size shouldBeGreaterThan 0 // weak
        users shouldNotBe emptyList() // weak
        roles shouldNotBe emptySet<String>() // weak
        title shouldNotBe "" // weak
        assertThat(entries).isNotEmpty() // weak
        assertThat(heading).isNotBlank() // weak
        assertThat(records).hasSizeGreaterThan(0) // weak
        assertThat(rows2).hasSizeGreaterThanOrEqualTo(1) // weak
        assertThat(data.size).isPositive() // weak
        assertThat(data.size).isGreaterThan(0) // weak`,
    ],
    [
      'a check on the contents or the exact length',
      `        assertTrue(items.isEmpty())
        assertTrue(items.size > 1)
        assertTrue(items.size >= 2 && ready)
        assertEquals(2, items.size)
        assertNotEquals(1, items.size)
        assertFalse(items.contains("a"))
        items.shouldBeEmpty()
        items shouldContainExactly listOf(1)
        items.size shouldBeGreaterThan 1
        val first = items.shouldNotBeEmpty().first()
        assertThat(items).isNotEmpty().hasSize(2)
        assertThat(items).hasSizeGreaterThan(1)
        assertThat(items.size).isEqualTo(2)
        assertThat(items.size).isGreaterThan(1)`,
    ],
    [
      'a mock call verified with a wildcard for every argument',
      `        verify { mailer.send(any(), any()) } // weak
        coVerify { repo.save(any<Order>()) } // weak
        verify(exactly = 2) { mailer.send(any(), anyString()) } // weak
        verify(atLeast = 1) { mailer.send(ofType<Order>()) } // weak
        verify(mailer).send(any(), anyInt()) // weak
        verify(mailer, times(2)).send(any(), any<Order>()) // weak
        verify(mailer, atLeastOnce()).send(anyString()) // weak
        then(mailer).should().send(any()) // weak
        then(mailer).should(times(2)).send(anyOrNull()) // weak`,
    ],
    [
      'each verified call of a block that only uses wildcards',
      `        verify {
            mailer.send(any()) // weak
            audit.record(order, any())
            audit.close(any()) // weak
        }`,
    ],
    [
      'a verified call with an argument, no arguments, or a negative check',
      `        verify { mailer.send(order, any()) }
        verify { mailer.flush() }
        verify(exactly = 1) { mailer.send(eq(order)) }
        verify(exactly = 0) { mailer.send(any(), any()) }
        verify(inverse = true) { mailer.send(any()) }
        verify(atMost = 1) { mailer.send(any()) }
        verify { mailer wasNot Called }
        verify { mailer.send(listOf(any())) }
        verify { mailer.send(audit.mark(any())) }
        verify { mailer.send(order).also { audit.mark(any()) } }
        coVerify(exactly = 0) { repo.save(any<Order>()) }
        verify(mailer).send(order)
        verify(mailer).flush()
        verify(mailer, never()).send(any())
        verify(mailer, times(0)).send(any())
        verify(mailer, atMostOnce()).send(any())
        then(mailer).should(never()).send(any())
        then(mailer).should().send(order)`,
    ],
  ])('reports exactly the marked lines for %s', (_name, body) => {
    expect(flagged(body)).toEqual(marked(body));
  });
});

describe('weak assertions in Kotest specs', () => {
  it('reports the weak forms in a leaf test and not in a test that asserts values', () => {
    const text = `${KOTEST_HEAD}class OrderSpec : FunSpec({
    test("weak") {
        order.shouldNotBeNull()
        items.shouldNotBeEmpty()
        verify { mailer.send(any()) }
    }
    test("strong") {
        items shouldContainExactly listOf(1)
        verify { mailer.send(order) }
    }
})
`;

    expect(summaryOf(text)).toEqual(Array(3).fill(`${WEAK_RULE} OrderSpec > weak`));
  });
});
