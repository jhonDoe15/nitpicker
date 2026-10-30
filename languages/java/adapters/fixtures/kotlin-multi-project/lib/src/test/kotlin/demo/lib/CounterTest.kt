package demo.lib

import kotlin.test.Test
import kotlin.test.assertEquals

class CounterTest {
    @Test
    fun countsOn() {
        assertEquals(8, Counter().next(1))
    }
}
