package demo.lib

import org.junit.Assert.assertEquals
import org.junit.Ignore
import org.junit.Test

class PricesTest {
    @Test
    fun doubles() {
        assertEquals(4, price(2))
    }

    @Ignore
    @Test
    fun skipped() {
        assertEquals(2, price(1))
    }
}
