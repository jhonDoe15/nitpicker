package demo.shared

import kotlin.test.Ignore
import kotlin.test.Test
import kotlin.test.assertEquals

class PricesTest {
    @Test
    fun doubles() {
        assertEquals(4, price(2))
    }

    @Ignore
    @Test
    fun skipped() {
        assertEquals("1", label(1).trim())
    }
}
