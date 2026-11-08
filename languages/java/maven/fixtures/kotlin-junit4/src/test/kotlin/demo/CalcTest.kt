package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class CalcTest {
    @Test
    fun doublesTheValue() {
        assertEquals(6, Calc().twice(3))
    }
}
