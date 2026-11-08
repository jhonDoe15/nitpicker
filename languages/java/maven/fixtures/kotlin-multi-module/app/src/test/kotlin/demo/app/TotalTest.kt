package demo.app

import kotlin.test.Test
import kotlin.test.assertEquals

class TotalTest {
    @Test
    fun sums() {
        assertEquals(6, Total().of(listOf(1, 2, 3)))
    }
}
