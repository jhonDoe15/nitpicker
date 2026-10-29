package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class FarewellTest {
    @Test
    fun saysFarewell() {
        assertEquals("Goodbye, Ada.", Greeter().farewell("Ada"))
    }
}
