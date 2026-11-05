package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class GreeterTest {
    @Test
    fun greetsByName() {
        assertEquals("Hello, Ada!", Greeter().greet("Ada"))
    }

    @Test
    fun greetsFromJava() {
        assertEquals("Hello, Java!", Bridge().hello())
    }
}
