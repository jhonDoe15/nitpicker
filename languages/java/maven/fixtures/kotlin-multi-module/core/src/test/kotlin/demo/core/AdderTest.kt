package demo.core

import kotlin.test.Test
import kotlin.test.assertEquals

class AdderTest {
    @Test
    fun adds() {
        assertEquals(4, Adder().add(1, 3))
    }
}
