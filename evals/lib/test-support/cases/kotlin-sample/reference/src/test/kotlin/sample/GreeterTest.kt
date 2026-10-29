package sample

import kotlin.test.Test
import kotlin.test.assertEquals

class GreeterTest {
    @Test
    fun greetsByName() {
        assertEquals("Hello, Ada!", Greeter().greet("Ada"))
    }

    @Test
    fun shoutsTheGreeting() {
        assertEquals("HELLO, ADA!", Greeter().shout("Ada"))
    }
}
