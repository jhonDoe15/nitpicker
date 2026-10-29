package sample

import kotlin.test.Test
import kotlin.test.assertEquals

class ShoutAcceptanceTest {
    @Test
    fun upperCasesTheGreeting() {
        assertEquals("HELLO, GRACE!", Greeter().shout("grace"))
    }
}
